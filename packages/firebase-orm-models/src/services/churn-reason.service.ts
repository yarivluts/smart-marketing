import {
  CANCELLATION_REASON_SCHEMA_FIELDS,
  CANCELLATION_REASON_SCHEMA_KIND,
  CANCELLATION_REASON_SCHEMA_NAME,
  clusterCancellationReasonComments,
  computeCancellationReasonCodeBreakdown,
  MetricCompilerError,
  type CancellationReasonCodeCount,
  type CancellationReasonThemeCluster,
} from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import type { RawRecordModel } from '../models/raw-record.model';
import type { SchemaDefModel } from '../models/schema-def.model';
import { ProjectNotFoundError } from './resource-library.service';
import { DuplicateSchemaDefinitionError, getActiveSchemaDefinition, registerSchemaDefinition } from './schema-registry.service';
import { listRecentRecordsForSchemas } from './pipeline.service';
import { MetricNotRegisteredError, MetricTargetsUnbuiltWarehouseTableError } from './metrics-compiler.service';
import { ProjectQueryQuotaExceededError } from './cost-guardrail.service';
import { queryMetrics } from './metrics-query.service';
import { WarehouseNotConfiguredError, WarehouseQueryFailedError, type WarehouseRow } from '../warehouse/query-executor';

/** Same load-bounding reasoning as `DEFAULT_NPS_OVERVIEW_RECORD_LIMIT` (KAN-82) — bounds Firestore read cost until a real aggregation store exists. */
export const DEFAULT_CANCELLATION_REASON_RECORD_LIMIT = 500;
/** The theme digest's default "this month" window. */
export const DEFAULT_CANCELLATION_REASON_WINDOW_DAYS = 30;
/** `cancellations_total`'s name in the Churn Reason pack (`churn-reason-pack/metrics.ts`) — the single metric every dimension breakdown below queries. */
export const CANCELLATIONS_TOTAL_METRIC_NAME = 'cancellations_total';

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

export interface EnsureCancellationReasonSchemaRegisteredParams {
  organizationId: string;
  projectId: string;
  createdByUserId: string;
}

export interface EnsureCancellationReasonSchemaRegisteredResult {
  schemaDef: SchemaDefModel;
  /** `false` when an active `cancellation_reason` schema already existed and this call was a no-op. */
  registered: boolean;
}

/**
 * Idempotently registers the KAN-84 `cancellation_reason` event schema
 * (v1) for a project, if it isn't already registered — the same "seed on
 * demand" posture `ensureSurveyResponseSchemaRegistered` (KAN-82) and
 * `ensureTouchpointSchemaRegistered` (KAN-57) established. Without this,
 * every cancellation reason a cancel flow sends would quarantine with
 * `schema_not_registered`.
 */
export async function ensureCancellationReasonSchemaRegistered(
  params: EnsureCancellationReasonSchemaRegisteredParams,
): Promise<EnsureCancellationReasonSchemaRegisteredResult> {
  const existing = await getActiveSchemaDefinition(
    params.organizationId,
    params.projectId,
    CANCELLATION_REASON_SCHEMA_KIND,
    CANCELLATION_REASON_SCHEMA_NAME,
  );
  if (existing) {
    return { schemaDef: existing, registered: false };
  }

  try {
    const schemaDef = await registerSchemaDefinition({
      organizationId: params.organizationId,
      projectId: params.projectId,
      kind: CANCELLATION_REASON_SCHEMA_KIND,
      name: CANCELLATION_REASON_SCHEMA_NAME,
      fields: CANCELLATION_REASON_SCHEMA_FIELDS.map((field) => ({
        name: field.name,
        type: field.type,
        isRequired: field.isRequired,
        isPii: field.isPii,
        isIdentityKey: field.isIdentityKey,
      })),
      createdByUserId: params.createdByUserId,
    });
    return { schemaDef, registered: true };
  } catch (err) {
    // `registerSchemaDefinition` isn't transactional (see its own doc comment) — a concurrent caller
    // can win the race between our existence check above and this call. Treat that the same as having
    // found it already registered, matching `ensureSurveyResponseSchemaRegistered`'s own posture.
    if (err instanceof DuplicateSchemaDefinitionError) {
      const nowActive = await getActiveSchemaDefinition(
        params.organizationId,
        params.projectId,
        CANCELLATION_REASON_SCHEMA_KIND,
        CANCELLATION_REASON_SCHEMA_NAME,
      );
      if (nowActive) {
        return { schemaDef: nowActive, registered: false };
      }
    }
    throw err;
  }
}

interface ParsedCancellationReason {
  readonly reasonCode: string;
  readonly comment: string | null;
  readonly landedAt: string;
}

/** Tolerantly parses one landed `cancellation_reason` raw record. Returns `null` when the payload carries no `reason_code` — the same "malformed data doesn't crash the read" posture `parseNpsResponse` (KAN-82) establishes. */
function parseCancellationReason(record: RawRecordModel): ParsedCancellationReason | null {
  const properties = record.payload.properties;
  if (typeof properties !== 'object' || properties === null) return null;
  const props = properties as Record<string, unknown>;

  const reasonCode = typeof props.reason_code === 'string' && props.reason_code.trim().length > 0 ? props.reason_code.trim() : null;
  if (reasonCode === null) return null;

  const comment = typeof props.comment === 'string' && props.comment.trim().length > 0 ? props.comment.trim() : null;
  return { reasonCode, comment, landedAt: record.landed_at };
}

/**
 * The bounded, landed `cancellation_reason` raw records every read below
 * shares — exported so a caller needing more than one of them (the Churn
 * Reasons admin page) can fetch once and pass the result via
 * `precomputedRecords`, same pass-through convention `listSurveyResponseRecordsForProject`
 * (KAN-82) established.
 */
export async function listCancellationReasonRecordsForProject(
  organizationId: string,
  projectId: string,
  limit: number = DEFAULT_CANCELLATION_REASON_RECORD_LIMIT,
): Promise<RawRecordModel[]> {
  return listRecentRecordsForSchemas({
    organizationId,
    projectId,
    kind: CANCELLATION_REASON_SCHEMA_KIND,
    schemaNames: [CANCELLATION_REASON_SCHEMA_NAME],
    limit,
  });
}

/**
 * The structured half of KAN-84's "live taxonomy" AC: every landed
 * cancellation's `reason_code`, counted — computed fresh from bounded,
 * landed raw records, folded across every environment (same "whole
 * project" posture `listRecentBillingEventsForProject`, KAN-80,
 * established), same as `getNpsOverviewForProject`'s own Firestore-side
 * computation.
 */
export async function getCancellationReasonCodeBreakdownForProject(
  organizationId: string,
  projectId: string,
  options?: { limit?: number; precomputedRecords?: RawRecordModel[] },
): Promise<CancellationReasonCodeCount[]> {
  await requireProjectInOrg(organizationId, projectId);
  const limit = options?.limit ?? DEFAULT_CANCELLATION_REASON_RECORD_LIMIT;
  const records = options?.precomputedRecords ?? (await listCancellationReasonRecordsForProject(organizationId, projectId, limit));
  const reasonCodes = records.map(parseCancellationReason).filter((r): r is ParsedCancellationReason => r !== null).map((r) => r.reasonCode);
  return computeCancellationReasonCodeBreakdown(reasonCodes);
}

function startOfUtcDayMs(ms: number): number {
  const date = new Date(ms);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * The free-text half of KAN-84's "AI clustering of free-text reasons into
 * a live taxonomy" AC: every landed cancellation's comment within the
 * trailing window, clustered by `clusterCancellationReasonComments`
 * (KAN-84's deterministic stand-in for a real LLM theme-clustering call,
 * same posture `getFeedbackThemeDigestForProject`/KAN-82 established).
 */
export async function getCancellationReasonThemeDigestForProject(
  organizationId: string,
  projectId: string,
  options?: { limit?: number; now?: number; windowDays?: number; precomputedRecords?: RawRecordModel[] },
): Promise<CancellationReasonThemeCluster[]> {
  await requireProjectInOrg(organizationId, projectId);
  const limit = options?.limit ?? DEFAULT_CANCELLATION_REASON_RECORD_LIMIT;
  const windowDays = options?.windowDays ?? DEFAULT_CANCELLATION_REASON_WINDOW_DAYS;
  const now = options?.now ?? Date.now();
  const windowStartMs = startOfUtcDayMs(now) - (windowDays - 1) * 24 * 60 * 60 * 1000;

  const records = options?.precomputedRecords ?? (await listCancellationReasonRecordsForProject(organizationId, projectId, limit));
  const comments = records
    .map(parseCancellationReason)
    .filter((r): r is ParsedCancellationReason => r !== null && r.comment !== null && Date.parse(r.landedAt) >= windowStartMs)
    .map((r) => r.comment as string);

  return clusterCancellationReasonComments(comments);
}

/** Every dimension `cancellations_total` (`churn-reason-pack/metrics.ts`) declares — the plan/channel/cohort breakdown axes the AC names. */
export type CancellationReasonBreakdownDimension = 'plan_interval' | 'channel_id' | 'cohort_month';

export type CancellationReasonDimensionBreakdownOutcome =
  | { ok: true; rows: WarehouseRow[] }
  | { ok: false; reason: 'warehouse_not_configured' | 'quota_exceeded' | 'not_yet_backed' | 'query_error'; message: string };

/**
 * The warehouse-backed half of the AC — "churn-reason breakdown joined to
 * plan/channel/cohort" — one `GROUP BY <dimension>` query against the
 * `fact_cancellation_reason` dbt mart (which itself performs the
 * plan/channel/cohort joins, see that model's own doc comment), reusing the
 * existing metrics/dimension-breakdown machinery exactly the way a board
 * table tile would. Never throws for an expected, per-query-recoverable
 * outcome — mirrors `queryBoardTile`'s (KAN-60) own catch-and-classify
 * posture, applied here to a single ad-hoc dimension query instead of a
 * saved board tile.
 */
export async function getCancellationReasonDimensionBreakdownForProject(
  organizationId: string,
  projectId: string,
  dimension: CancellationReasonBreakdownDimension,
): Promise<CancellationReasonDimensionBreakdownOutcome> {
  try {
    const result = await queryMetrics({
      organizationId,
      projectId,
      request: {
        metrics: [CANCELLATIONS_TOTAL_METRIC_NAME],
        dimensions: [dimension],
        // A lifetime breakdown, not a windowed one — the AC asks "reason X
        // is 3x more common in accounts from channel Y", not "...this
        // month". `grain: 'year'` minimizes how many `bucket_date` buckets
        // the compiler's own always-on time bucketing (see `compiler.ts`'s
        // `groupByColumns`) fragments each dimension value into; callers
        // sum across every returned row per dimension value regardless
        // (`toCancellationReasonDimensionBreakdownRows`), so the exact
        // grain doesn't affect correctness, only row count.
        time: { start: '1970-01-01', end: '2999-12-31', grain: 'year' },
      },
    });
    return { ok: true, rows: result.series };
  } catch (error) {
    if (error instanceof WarehouseNotConfiguredError) {
      return { ok: false, reason: 'warehouse_not_configured', message: error.message };
    }
    if (error instanceof ProjectQueryQuotaExceededError) {
      return { ok: false, reason: 'quota_exceeded', message: error.message };
    }
    if (error instanceof MetricTargetsUnbuiltWarehouseTableError) {
      return { ok: false, reason: 'not_yet_backed', message: error.message };
    }
    if (
      error instanceof MetricCompilerError ||
      error instanceof ProjectNotFoundError ||
      error instanceof MetricNotRegisteredError ||
      error instanceof WarehouseQueryFailedError
    ) {
      return { ok: false, reason: 'query_error', message: error.message };
    }
    throw error;
  }
}
