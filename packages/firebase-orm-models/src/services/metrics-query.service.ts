import { createHash } from 'node:crypto';
import { collectIdentifiers, fillEmptyBuckets, parseFormula, type CompilerParamValue, type MetricQueryRequest } from '@growthos/shared';
import type { ProjectModel } from '../models/project.model';
import type { MetricAggregationDef, MetricDefModel, MetricDefinitionKind } from '../models/metric-def.model';
import { compileMetricQueryForProject, MetricTargetsUnbuiltWarehouseTableError } from './metrics-compiler.service';
import { resolveDefaultQueryEnvironment } from './organization.service';
import { getActiveMetricDefinition, listMetricDefinitionsForProject } from './metric-registry.service';
import { checkProjectQueryQuota, recordQueryCostLogEntry, ProjectQueryQuotaExceededError, type ProjectCostQuota } from './cost-guardrail.service';
import { defaultMetricQueryResultCache, type MetricQueryResultCache } from '../warehouse/result-cache';
import { defaultWarehouseQueryExecutor, supportsQueryStats, WarehouseNotConfiguredError, type WarehouseQueryExecutor, type WarehouseRow } from '../warehouse/query-executor';

/** Default TTL for a cached query result — the plan gives no specific number, so this picks a value short enough that a metric evolving mid-day doesn't stay stale for long, while still absorbing the AC's own "p95 < 1.5s on cached" repeat-request burst (e.g. a dashboard's several tiles re-querying the same window seconds apart). */
export const DEFAULT_METRIC_QUERY_CACHE_TTL_SECONDS = 60;

/**
 * A cache key derived from the project the query runs against plus the two
 * things that determine its result within that project: which metric
 * *versions* it depends on (`definitionRefs`, e.g. `metric:cac@v3`) and the
 * compiled SQL's own bind params (time range, filters) — the plan's own
 * "keyed by def-version+params" AC. `organizationId`/`projectId` are
 * included even though a metric name is already unique within a project:
 * `definitionRefs` is just `metric:<name>@v<version>`, so two different
 * projects each defining their own metric named `cac` at version 3 would
 * otherwise collide on the exact same cache key and one project could read
 * back another's cached result — the cross-tenant leak every other lookup in
 * this codebase (KAN-26) is careful to avoid. Deliberately excludes the
 * compiled SQL text itself: two requests compiling to differently-formatted
 * SQL for the same definitions+params would otherwise miss each other's
 * cache entry for no semantic reason. Including the version in every ref
 * means a metric evolving to a new version naturally misses the old cache
 * entries instead of needing an explicit invalidation step — the previous
 * version's cached entries simply age out via TTL.
 */
function buildResultCacheKey(
  organizationId: string,
  projectId: string,
  environmentId: string | null,
  definitionRefs: Record<string, string>,
  params: Record<string, CompilerParamValue>,
): string {
  const sortEntries = <T>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
  // `environmentId` is included explicitly even though a resolved env also
  // appears in `params` as `tenant_environment_id` — if any code path ever
  // left the env unset, two different environments' queries would otherwise
  // share one cache entry and serve each other's rows, the same
  // cross-slice-leak reasoning as including org/project above.
  const canonical = JSON.stringify({ organizationId, projectId, environmentId, definitionRefs: sortEntries(definitionRefs), params: sortEntries(params) });
  return createHash('sha256').update(canonical).digest('hex');
}

export interface QueryMetricsParams {
  organizationId: string;
  projectId: string;
  /**
   * The environment whose rows this query counts. An API-key caller passes
   * its key's own bound environment (`ApiKeyAuthContext.environmentId` — a
   * test-mode key sees test data, by design); when omitted, the project's
   * `prod` environment is resolved server-side ({@link
   * resolveDefaultQueryEnvironment}) so every human-facing surface (board
   * tiles, goal thermometers, TV boards) counts live traffic only — never a
   * blend of test and prod events (session-B QA, 2026-08-19).
   */
  environmentId?: string;
  request: MetricQueryRequest;
  /** Defaults to {@link defaultWarehouseQueryExecutor} — overridable so tests can inject a fake executor without a real warehouse. */
  executor?: WarehouseQueryExecutor;
  /** Defaults to {@link defaultMetricQueryResultCache} — overridable per-call for the same reason as `executor`. */
  cache?: MetricQueryResultCache;
  cacheTtlSeconds?: number;
  /**
   * Skips this call's own project/quota/metric-catalog fetches when a
   * caller already has them (`board.service.ts`'s `queryBoardTiles` fetches
   * each exactly once and shares it across every tile — see
   * `queryBoardTile`'s own doc comment for the N+1 this closes). Threaded
   * straight through to `compileMetricQueryForProject`/`checkProjectQueryQuota`,
   * which document their own identical params; omitted entirely, this call
   * behaves exactly as it did before these params existed.
   */
  precomputedProject?: ProjectModel;
  precomputedActiveMetricDefsByName?: ReadonlyMap<string, MetricDefModel>;
  precomputedQuota?: ProjectCostQuota;
  /**
   * Completes the returned series to one row per time bucket of the requested range (KAN-210
   * follow-up) - 0 for a count/count_distinct/sum metric, `null` (a gap, never a made-up 0) for
   * avg/min/max and formula metrics. See `fillEmptyBuckets` in `@growthos/shared` for the exact
   * rules, including why an entirely empty result stays empty.
   *
   * Opt-in, because not every caller wants a row per bucket: a heatmap reads an absent cohort cell as
   * "not observable yet", a histogram queries from a 1970 floor, and the many internal callers that
   * only sum a series gain nothing but rows. Time-series surfaces - board line/bar tiles, goal
   * progress, the MCP metric tools - turn it on, so they all show the same series. Applied after the
   * result cache, which keeps the warehouse's own rows, so filled and unfilled callers share entries.
   */
  fillEmptyBuckets?: boolean;
}

export interface MetricQueryResult {
  series: WarehouseRow[];
  /** `metric:<name>@v<version>` per metric the query depends on (requested or transitively referenced by a formula) — see `compileMetricQueryForProject`. */
  definitionRefs: Record<string, string>;
  cacheHit: boolean;
}

/**
 * Best-effort cost-log write — swallows a Firestore failure rather than
 * letting it mask `queryMetrics`'s own outcome (a successful result, a
 * `ProjectQueryQuotaExceededError`, or a `WarehouseNotConfiguredError`), the
 * same "logging is a side effect, never the primary failure" posture
 * `recordOrchestrationRunAudit` already established for audit entries.
 */
async function logCostAttempt(
  organizationId: string,
  projectId: string,
  outcome: Parameters<typeof recordQueryCostLogEntry>[0]['outcome'],
  definitionRefs: Record<string, string>,
  estimatedCostUsd?: number | null,
): Promise<void> {
  try {
    await recordQueryCostLogEntry({ organizationId, projectId, outcome, definitionRefs, estimatedCostUsd });
  } catch {
    // Best-effort — see this function's own doc comment.
  }
}

/**
 * `POST /v1/metrics/query`'s integration point (KAN-42, plan `13 §E5.3`):
 * resolves + compiles the request via KAN-41's `compileMetricQueryForProject`,
 * fails fast with `MetricTargetsUnbuiltWarehouseTableError` if the compiled
 * query depends on a known-unbuilt warehouse table (see that error's own doc
 * comment — cheaper and cleaner than a doomed warehouse round trip),
 * otherwise serves a cached result when one exists for the same definition
 * versions+params, otherwise checks the project's KAN-39 cost-guardrail quota
 * before executing the compiled SQL via a {@link WarehouseQueryExecutor} and
 * caching the result. Throws whatever `compileMetricQueryForProject` throws
 * (`ProjectNotFoundError`, `MetricNotRegisteredError`, `MetricCompilerError`)
 * for an invalid request, `MetricTargetsUnbuiltWarehouseTableError` per
 * above, `ProjectQueryQuotaExceededError` once the project has spent its
 * daily quota of real (non-cache-hit) query attempts, and whatever the
 * executor itself throws (typically `WarehouseNotConfiguredError` from the
 * default executor) once the request clears every check.
 *
 * A cache hit is neither logged nor counted against the quota — it incurs no
 * real (or would-be) warehouse cost, so KAN-39's cost log only ever records
 * an entry for a call that actually reached (or was turned away right before)
 * a {@link WarehouseQueryExecutor}. Every other outcome — a successful
 * execution, `WarehouseNotConfiguredError`, or any other error the executor
 * throws — is logged as `'executed'`: it cleared the guardrail and reached
 * the executor, which is what the quota counts against, regardless of
 * whether the executor itself then succeeded or failed.
 *
 * On a successful execution, an executor that also implements
 * `WarehouseQueryExecutorWithStats` (the real `BigQueryWarehouseQueryExecutor`,
 * KAN-18) is called via `executeWithStats` instead of `execute`, so its
 * reported cost estimate can ride along into the logged entry's
 * `estimated_cost_usd` — every other executor (every test fake, and the
 * default `NotConfiguredWarehouseQueryExecutor`, which never reaches this
 * branch anyway) keeps logging `null`, unchanged.
 */
export async function queryMetrics(params: QueryMetricsParams): Promise<MetricQueryResult> {
  const executor = params.executor ?? defaultWarehouseQueryExecutor;
  const cache = params.cache ?? defaultMetricQueryResultCache;
  const cacheTtlSeconds = params.cacheTtlSeconds ?? DEFAULT_METRIC_QUERY_CACHE_TTL_SECONDS;

  const environmentId = params.environmentId ?? (await resolveDefaultQueryEnvironment(params.organizationId, params.projectId))?.id ?? null;

  const compiled = await compileMetricQueryForProject({
    organizationId: params.organizationId,
    projectId: params.projectId,
    ...(environmentId !== null ? { environmentId } : {}),
    request: params.request,
    ...(params.precomputedProject ? { precomputedProject: params.precomputedProject } : {}),
    ...(params.precomputedActiveMetricDefsByName ? { precomputedActiveMetricDefsByName: params.precomputedActiveMetricDefsByName } : {}),
  });

  if (compiled.unbuiltWarehouseTables.length > 0) {
    const { metricName, table } = compiled.unbuiltWarehouseTables[0];
    throw new MetricTargetsUnbuiltWarehouseTableError(metricName, table);
  }

  const shapeSeries = (rows: WarehouseRow[]): WarehouseRow[] =>
    params.fillEmptyBuckets
      ? fillEmptyBuckets(rows, { time: params.request.time, dimensions: [...new Set(params.request.dimensions ?? [])], metrics: compiled.emptyBucketValues })
      : rows;

  const cacheKey = buildResultCacheKey(params.organizationId, params.projectId, environmentId, compiled.definitionRefs, compiled.params);
  const cached = cache.get(cacheKey);
  if (cached) {
    return { series: shapeSeries(cached), definitionRefs: compiled.definitionRefs, cacheHit: true };
  }

  const quota = await checkProjectQueryQuota(params.organizationId, params.projectId, new Date(), params.precomputedQuota);
  if (!quota.allowed) {
    await logCostAttempt(params.organizationId, params.projectId, 'blocked_quota_exceeded', compiled.definitionRefs);
    throw new ProjectQueryQuotaExceededError(quota.limit);
  }

  try {
    let series: WarehouseRow[];
    let estimatedCostUsd: number | null = null;
    if (supportsQueryStats(executor)) {
      const executed = await executor.executeWithStats(compiled);
      series = executed.rows;
      estimatedCostUsd = executed.stats.estimatedCostUsd;
    } else {
      series = await executor.execute(compiled);
    }
    cache.set(cacheKey, series, cacheTtlSeconds);
    await logCostAttempt(params.organizationId, params.projectId, 'executed', compiled.definitionRefs, estimatedCostUsd);
    return { series: shapeSeries(series), definitionRefs: compiled.definitionRefs, cacheHit: false };
  } catch (error) {
    const outcome = error instanceof WarehouseNotConfiguredError ? 'warehouse_not_configured' : 'executed';
    await logCostAttempt(params.organizationId, params.projectId, outcome, compiled.definitionRefs);
    throw error;
  }
}

/** One project's registered metric, as `GET /v1/metrics`'s catalog lists it. */
export interface MetricCatalogEntry {
  name: string;
  version: number;
  definitionKind: MetricDefinitionKind;
  dimensions: string[];
  /** The metric's declared unit (KAN-213) — see `MetricDefModel.unit`. Absent when none is declared, meaning a plain number. */
  unit?: string;
}

/** `GET /v1/metrics` (plan `12 §3`): every metric family's current `active` version in a project — deliberately excludes `superseded` versions, unlike the admin UI's `listMetricDefinitionsForProject` (KAN-40), which browses the full history. */
export async function listMetricsCatalogForProject(organizationId: string, projectId: string): Promise<MetricCatalogEntry[]> {
  const defs = await listMetricDefinitionsForProject(organizationId, projectId);
  return defs
    .filter((def) => def.status === 'active')
    .map((def) => ({
      name: def.name,
      version: def.version,
      definitionKind: def.definition_kind,
      dimensions: def.dimensions,
      ...(def.unit ? { unit: def.unit } : {}),
    }));
}

/** `GET /v1/metrics/{name}`'s "definition + lineage" shape — `dependsOn` is the formula's own direct metric references (not transitive; a dashboard/AI caller wanting the full dependency tree can walk it one hop at a time via repeat calls). Empty for an aggregation-kind metric, which depends on no other metric. */
export interface MetricCatalogDetail extends MetricCatalogEntry {
  aggregation?: MetricAggregationDef;
  formula?: string;
  dependsOn: string[];
  /**
   * What has to be sent for this metric to be non-zero, in the caller's own terms.
   *
   * A metric names a warehouse table, and knowing the table tells you nothing about what to
   * emit: `signups` reads `fact_funnel_event`, and no amount of staring at that name reveals
   * that it wants an event whose schema is called `signup` carrying a `customer_id`. Someone
   * integrating would register a schema, POST successfully, see `accepted: 1`, and still read
   * zero - with the definition in front of them and no way to tell what was missing.
   *
   * Undefined when the metric reads a table this cannot speak for (a custom measure/entity
   * mart, or a core table with no event-shaped source). Saying nothing is better than guessing.
   */
  requiredEvents?: RequiredEventHint[];
}

/** One event a metric needs in order to count anything. */
export interface RequiredEventHint {
  /** The `schema` value the ingest envelope must carry, i.e. the registered schema's name. */
  event: string;
  /** Envelope/property fields the metric reads, so an event that omits them counts for nothing. */
  requiredFields: string[];
  /** Why this event, in one line — the actual derivation, not a restatement of the filter. */
  because: string;
}

/**
 * Derives {@link MetricCatalogDetail.requiredEvents} from an aggregation definition.
 *
 * Only `fact_funnel_event` is modelled here, deliberately. Its lineage is simple and total —
 * `fact_funnel_event` selects every non-touchpoint row of `events` and sets
 * `step = properties.event_name ?? event_type`, where `event_type` is the record's own
 * `schema_name` — so a `step = X` filter means exactly "send an event whose schema is X".
 *
 * The other core tables are not guessed at. `dim_subscription` and `fact_revenue_event` fold
 * several event types through their own logic, and a hint that is confidently wrong is worse
 * than none: it would send someone off to emit an event that changes nothing.
 */
function deriveRequiredEvents(aggregation: MetricAggregationDef | undefined): RequiredEventHint[] | undefined {
  if (!aggregation || aggregation.table !== 'fact_funnel_event') {
    return undefined;
  }

  const stepFilter = (aggregation.filters ?? []).find((filter) => filter.field === 'step' && filter.operator === '=');
  if (!stepFilter || typeof stepFilter.value !== 'string') {
    // No step filter means the metric counts every event, which is a real answer worth giving.
    return [
      {
        event: '*',
        requiredFields: aggregation.column ? [aggregation.column] : [],
        because: 'Counts every non-touchpoint event this project ingests, whatever its schema.',
      },
    ];
  }

  return [
    {
      event: stepFilter.value,
      // customer_id on fact_funnel_event is the record's entity_id, which the ingest envelope
      // carries — so naming the column directly would send someone looking for a property.
      requiredFields: aggregation.column === 'customer_id' ? ['customer_id (envelope)'] : aggregation.column ? [aggregation.column] : [],
      because: `fact_funnel_event.step is the event's own schema name, so this metric counts events registered and sent as "${stepFilter.value}".`,
    },
  ];
}

/** `GET /v1/metrics/{name}` (plan `12 §3`): the active version's full definition, or `null` if no metric is registered under that name — the same 404-not-403 non-enumeration posture as every other cross-tenant lookup in this codebase (there's nothing tenant-scoped to leak here, but the shape is kept consistent). */
export async function getMetricCatalogDetail(organizationId: string, projectId: string, name: string): Promise<MetricCatalogDetail | null> {
  const active = await getActiveMetricDefinition(organizationId, projectId, name);
  if (!active) {
    return null;
  }
  const dependsOn = active.definition_kind === 'formula' && active.formula ? [...collectIdentifiers(parseFormula(active.formula))] : [];
  const requiredEvents = deriveRequiredEvents(active.aggregation);
  return {
    name: active.name,
    version: active.version,
    definitionKind: active.definition_kind,
    dimensions: active.dimensions,
    ...(active.unit ? { unit: active.unit } : {}),
    ...(active.aggregation ? { aggregation: active.aggregation } : {}),
    ...(active.formula ? { formula: active.formula } : {}),
    dependsOn,
    ...(requiredEvents ? { requiredEvents } : {}),
  };
}
