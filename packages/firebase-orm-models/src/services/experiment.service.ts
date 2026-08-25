import {
  computeExperimentResult,
  EXPERIMENT_CONVERSION_SCHEMA_KIND,
  EXPERIMENT_CONVERSION_SCHEMA_NAME,
  EXPERIMENT_EXPOSURE_SCHEMA_KIND,
  EXPERIMENT_EXPOSURE_SCHEMA_NAME,
  EXPERIMENT_SCHEMA_FIELDS,
  MetricCompilerError,
  type ExperimentResult,
  type ExperimentVariantCounts,
} from '@growthos/shared';
import type { SchemaDefModel } from '../models/schema-def.model';
import { ProjectNotFoundError } from './resource-library.service';
import { DuplicateSchemaDefinitionError, getActiveSchemaDefinition, registerSchemaDefinition } from './schema-registry.service';
import { MetricNotRegisteredError, MetricTargetsUnbuiltWarehouseTableError } from './metrics-compiler.service';
import { ProjectQueryQuotaExceededError } from './cost-guardrail.service';
import { queryMetrics } from './metrics-query.service';
import { WarehouseNotConfiguredError, WarehouseQueryFailedError, type WarehouseRow } from '../warehouse/query-executor';

export interface EnsureExperimentSchemasRegisteredParams {
  organizationId: string;
  projectId: string;
  createdByUserId: string;
}

export interface EnsureExperimentSchemasRegisteredResult {
  exposureSchemaDef: SchemaDefModel;
  conversionSchemaDef: SchemaDefModel;
}

async function ensureOneExperimentSchemaRegistered(
  kind: 'event',
  name: string,
  params: EnsureExperimentSchemasRegisteredParams,
): Promise<SchemaDefModel> {
  const existing = await getActiveSchemaDefinition(params.organizationId, params.projectId, kind, name);
  if (existing) return existing;

  try {
    return await registerSchemaDefinition({
      organizationId: params.organizationId,
      projectId: params.projectId,
      kind,
      name,
      fields: EXPERIMENT_SCHEMA_FIELDS.map((field) => ({
        name: field.name,
        type: field.type,
        isRequired: field.isRequired,
        isPii: field.isPii,
        isIdentityKey: field.isIdentityKey,
      })),
      createdByUserId: params.createdByUserId,
    });
  } catch (err) {
    // `registerSchemaDefinition` isn't transactional (see its own doc comment) — a concurrent caller
    // can win the race between our existence check above and this call. Treat that the same as having
    // found it already registered, matching `ensureSurveyResponseSchemaRegistered`'s (KAN-82) posture.
    if (err instanceof DuplicateSchemaDefinitionError) {
      const nowActive = await getActiveSchemaDefinition(params.organizationId, params.projectId, kind, name);
      if (nowActive) return nowActive;
    }
    throw err;
  }
}

/**
 * Idempotently registers the KAN-89 `experiment_exposure` and
 * `experiment_conversion` event schemas (v1 each) for a project, if either
 * isn't already registered — the same "seed on demand" posture
 * `ensureSurveyResponseSchemaRegistered` (KAN-82) / `ensureCancellationReasonSchemaRegistered`
 * (KAN-84) establish. Without this, every exposure/conversion an
 * experiment client sends would quarantine with `schema_not_registered`.
 */
export async function ensureExperimentSchemasRegistered(
  params: EnsureExperimentSchemasRegisteredParams,
): Promise<EnsureExperimentSchemasRegisteredResult> {
  const [exposureSchemaDef, conversionSchemaDef] = await Promise.all([
    ensureOneExperimentSchemaRegistered(EXPERIMENT_EXPOSURE_SCHEMA_KIND, EXPERIMENT_EXPOSURE_SCHEMA_NAME, params),
    ensureOneExperimentSchemaRegistered(EXPERIMENT_CONVERSION_SCHEMA_KIND, EXPERIMENT_CONVERSION_SCHEMA_NAME, params),
  ]);
  return { exposureSchemaDef, conversionSchemaDef };
}

export type ExperimentResultsOutcome =
  | { ok: true; results: ExperimentResult[] }
  | { ok: false; reason: 'warehouse_not_configured' | 'quota_exceeded' | 'not_yet_backed' | 'query_error'; message: string };

function classifyMetricQueryError(error: unknown): ExperimentResultsOutcome {
  if (error instanceof WarehouseNotConfiguredError) {
    return { ok: false, reason: 'warehouse_not_configured', message: error.message };
  }
  if (error instanceof ProjectQueryQuotaExceededError) {
    return { ok: false, reason: 'quota_exceeded', message: error.message };
  }
  if (error instanceof MetricTargetsUnbuiltWarehouseTableError) {
    return { ok: false, reason: 'not_yet_backed', message: error.message };
  }
  if (error instanceof MetricCompilerError || error instanceof ProjectNotFoundError || error instanceof MetricNotRegisteredError || error instanceof WarehouseQueryFailedError) {
    return { ok: false, reason: 'query_error', message: error.message };
  }
  throw error;
}

/** A warehouse cell can come back typed (`number`) or stringified (`string`) depending on the executor (`WarehouseRow = Record<string, string | number | null>`) — coerces either into a finite number, defaulting a `null`/unparseable cell to 0, same tolerant-coercion posture `toWarehouseNumber` (quality-score.service.ts/firmographic.service.ts) establishes for the identical class of value. */
function toWarehouseNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Folds an `experiment_exposures`/`experiment_conversions` dimension-
 * breakdown query's raw `WarehouseRow[]` into one `ExperimentResult` per
 * distinct `experiment_key`, each with its own per-variant significance
 * test — sums (not just reads) each row's counts per (experiment_key,
 * variant_key) pair, same "the compiler always buckets by its own
 * `bucket_date` regardless of the requested dimensions" reasoning
 * `toNpsDimensionBreakdownRows` (KAN-82) documents for its own metric
 * breakdown. Skips a row with no `experiment_key`/`variant_key` — the
 * compiler groups by `null` as a real bucket for a metric that's never
 * been queried with a dimension present on zero rows, which would
 * otherwise become an experiment with an empty-string key.
 */
function groupRowsIntoExperimentResults(rows: readonly WarehouseRow[]): ExperimentResult[] {
  const byExperiment = new Map<string, Map<string, ExperimentVariantCounts>>();

  for (const row of rows) {
    const experimentKey = row.experiment_key;
    const variantKey = row.variant_key;
    if (typeof experimentKey !== 'string' || !experimentKey || typeof variantKey !== 'string' || !variantKey) continue;

    const variants = byExperiment.get(experimentKey) ?? new Map<string, ExperimentVariantCounts>();
    const existing = variants.get(variantKey) ?? { variantKey, exposures: 0, conversions: 0 };
    existing.exposures += toWarehouseNumber(row.experiment_exposures);
    existing.conversions += toWarehouseNumber(row.experiment_conversions);
    variants.set(variantKey, existing);
    byExperiment.set(experimentKey, variants);
  }

  return Array.from(byExperiment.entries())
    .map(([experimentKey, variants]) => computeExperimentResult(experimentKey, Array.from(variants.values())))
    .sort((a, b) => a.experimentKey.localeCompare(b.experimentKey));
}

/**
 * Every experiment this project has landed exposure/conversion data for,
 * with each variant's significance test against its own control
 * (`computeExperimentResult`, `@growthos/shared`) — the "results view with
 * significance testing" half of the AC (plan `14 §Gap 3`). One
 * `queryMetrics` call requests both `experiment_exposures`/
 * `experiment_conversions` broken down by `[experiment_key, variant_key]`
 * together (both metrics declare the identical dimension pair — see
 * `experiment-pack/metrics.ts`), the same one-call-for-several-metrics
 * shape `getNpsDimensionBreakdownForProject`'s three-metric NPS query
 * establishes, rather than one call per metric. Never throws for an
 * expected, per-query-recoverable outcome — mirrors that function's own
 * catch-and-classify posture.
 */
export async function getExperimentResultsForProject(organizationId: string, projectId: string): Promise<ExperimentResultsOutcome> {
  try {
    const result = await queryMetrics({
      organizationId,
      projectId,
      request: {
        metrics: ['experiment_exposures', 'experiment_conversions'],
        dimensions: ['experiment_key', 'variant_key'],
        // A lifetime view, not a windowed one — same reasoning `getNpsDimensionBreakdownForProject`
        // (KAN-82) documents: an experiment's result should reflect all its data, not just a recent
        // window, and this pack has no separate "experiment start/end date" concept to window by yet.
        time: { start: '1970-01-01', end: '2999-12-31', grain: 'year' },
      },
    });
    return { ok: true, results: groupRowsIntoExperimentResults(result.series) };
  } catch (error) {
    return classifyMetricQueryError(error);
  }
}
