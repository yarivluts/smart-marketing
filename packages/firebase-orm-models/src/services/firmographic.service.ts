import {
  computeFirmographicIndustryBreakdown,
  evaluateCompositionShift,
  FIRMOGRAPHIC_SCHEMA_FIELDS,
  FIRMOGRAPHIC_SCHEMA_KIND,
  FIRMOGRAPHIC_SCHEMA_NAME,
  MetricCompilerError,
  type CompositionShiftAction,
  type FirmographicIndustryCount,
} from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import type { RawRecordModel } from '../models/raw-record.model';
import type { SchemaDefModel } from '../models/schema-def.model';
import { FirmographicCompositionAlertModel } from '../models/firmographic-composition-alert.model';
import { ProjectNotFoundError } from './resource-library.service';
import { DuplicateSchemaDefinitionError, getActiveSchemaDefinition, registerSchemaDefinition } from './schema-registry.service';
import { listRecentRecordsForSchemas } from './pipeline.service';
import { MetricNotRegisteredError, MetricTargetsUnbuiltWarehouseTableError } from './metrics-compiler.service';
import { ProjectQueryQuotaExceededError } from './cost-guardrail.service';
import { queryMetrics } from './metrics-query.service';
import { recordAuditLogEntry } from './audit-log.service';
import { WarehouseNotConfiguredError, WarehouseQueryFailedError, type WarehouseQueryExecutor, type WarehouseRow } from '../warehouse/query-executor';
import type { MetricQueryResultCache } from '../warehouse/result-cache';

/** Test-only injection seam shared by every warehouse-backed function below — production callers never pass these, `queryMetrics` defaults to the real executor/cache. */
interface WarehouseQueryOverrides {
  executor?: WarehouseQueryExecutor;
  cache?: MetricQueryResultCache;
}

/** Same load-bounding reasoning as `DEFAULT_CANCELLATION_REASON_RECORD_LIMIT` (KAN-84) — bounds Firestore read cost until a real aggregation store exists. */
export const DEFAULT_FIRMOGRAPHIC_RECORD_LIMIT = 500;

/** The composition-shift check's own current/baseline window size (KAN-87, plan `14 §Gap 11`) — same 14-day reasoning `QUALITY_MIX_ALERT_WINDOW_DAYS` (KAN-83) documents: smooths day-of-week noise while staying responsive within two weeks. */
export const FIRMOGRAPHIC_COMPOSITION_ALERT_WINDOW_DAYS = 14;

const MANUAL_TRIGGER = 'manual' as const;

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

export interface EnsureFirmographicSchemaRegisteredParams {
  organizationId: string;
  projectId: string;
  createdByUserId: string;
}

export interface EnsureFirmographicSchemaRegisteredResult {
  schemaDef: SchemaDefModel;
  /** `false` when an active `company_firmographic` schema already existed and this call was a no-op. */
  registered: boolean;
}

/**
 * Idempotently registers the KAN-87 `company_firmographic` event schema
 * (v1) for a project, if it isn't already registered — the same "seed on
 * demand" posture `ensureCancellationReasonSchemaRegistered` (KAN-84) and
 * `ensureSurveyResponseSchemaRegistered` (KAN-82) established. Without
 * this, every firmographic profile a signup/onboarding flow sends would
 * quarantine with `schema_not_registered`.
 */
export async function ensureFirmographicSchemaRegistered(
  params: EnsureFirmographicSchemaRegisteredParams,
): Promise<EnsureFirmographicSchemaRegisteredResult> {
  const existing = await getActiveSchemaDefinition(params.organizationId, params.projectId, FIRMOGRAPHIC_SCHEMA_KIND, FIRMOGRAPHIC_SCHEMA_NAME);
  if (existing) {
    return { schemaDef: existing, registered: false };
  }

  try {
    const schemaDef = await registerSchemaDefinition({
      organizationId: params.organizationId,
      projectId: params.projectId,
      kind: FIRMOGRAPHIC_SCHEMA_KIND,
      name: FIRMOGRAPHIC_SCHEMA_NAME,
      fields: FIRMOGRAPHIC_SCHEMA_FIELDS.map((field) => ({
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
    // found it already registered, matching `ensureCancellationReasonSchemaRegistered`'s own posture.
    if (err instanceof DuplicateSchemaDefinitionError) {
      const nowActive = await getActiveSchemaDefinition(params.organizationId, params.projectId, FIRMOGRAPHIC_SCHEMA_KIND, FIRMOGRAPHIC_SCHEMA_NAME);
      if (nowActive) {
        return { schemaDef: nowActive, registered: false };
      }
    }
    throw err;
  }
}

interface ParsedFirmographicProfile {
  readonly industry: string;
  readonly landedAt: string;
}

/** Tolerantly parses one landed `company_firmographic` raw record. Returns `null` when the payload carries no `industry` — the same "malformed data doesn't crash the read" posture `parseCancellationReason` (KAN-84) establishes. */
function parseFirmographicProfile(record: RawRecordModel): ParsedFirmographicProfile | null {
  const properties = record.payload.properties;
  if (typeof properties !== 'object' || properties === null) return null;
  const props = properties as Record<string, unknown>;

  const industry = typeof props.industry === 'string' && props.industry.trim().length > 0 ? props.industry.trim() : null;
  if (industry === null) return null;

  return { industry, landedAt: record.landed_at };
}

/**
 * The bounded, landed `company_firmographic` raw records every read below
 * shares — exported so a caller needing more than one of them (the
 * Firmographics admin page) can fetch once and pass the result via
 * `precomputedRecords`, same pass-through convention
 * `listCancellationReasonRecordsForProject` (KAN-84) established.
 */
export async function listFirmographicRecordsForProject(
  organizationId: string,
  projectId: string,
  limit: number = DEFAULT_FIRMOGRAPHIC_RECORD_LIMIT,
): Promise<RawRecordModel[]> {
  return listRecentRecordsForSchemas({
    organizationId,
    projectId,
    kind: FIRMOGRAPHIC_SCHEMA_KIND,
    schemaNames: [FIRMOGRAPHIC_SCHEMA_NAME],
    limit,
  });
}

/**
 * The Firestore-side half of KAN-87's composition dashboard — every landed
 * profile's `industry`, counted — computed fresh from bounded, landed raw
 * records, folded across every environment (same "whole project" posture
 * `listRecentBillingEventsForProject`, KAN-80, established), no warehouse
 * required, same posture `getCancellationReasonCodeBreakdownForProject`'s
 * own Firestore-side computation.
 */
export async function getFirmographicIndustryBreakdownForProject(
  organizationId: string,
  projectId: string,
  options?: { limit?: number; precomputedRecords?: RawRecordModel[] },
): Promise<FirmographicIndustryCount[]> {
  await requireProjectInOrg(organizationId, projectId);
  const limit = options?.limit ?? DEFAULT_FIRMOGRAPHIC_RECORD_LIMIT;
  const records = options?.precomputedRecords ?? (await listFirmographicRecordsForProject(organizationId, projectId, limit));
  const industries = records.map(parseFirmographicProfile).filter((r): r is ParsedFirmographicProfile => r !== null).map((r) => r.industry);
  return computeFirmographicIndustryBreakdown(industries);
}

export type FirmographicQueryOutcome =
  | { ok: true; rows: WarehouseRow[] }
  | { ok: false; reason: 'warehouse_not_configured' | 'quota_exceeded' | 'not_yet_backed' | 'query_error'; message: string };

function classifyMetricQueryError(error: unknown): FirmographicQueryOutcome {
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

/** Every dimension `firmographic_profiles_total`/`firmographic_mrr_total` (`firmographic-pack/metrics.ts`) both declare — the industry/employee-count/region composition axes the AC names. */
export type FirmographicBreakdownDimension = 'industry' | 'employee_count_range' | 'region';

/**
 * The warehouse-backed half of the AC — "composition dashboards (# vs $)"
 * — one query against `fact_company_firmographic` returning BOTH
 * `firmographic_profiles_total` (#) and `firmographic_mrr_total` ($) broken
 * down by `dimension`, reusing the existing metrics/dimension-breakdown
 * machinery exactly the way a board table tile would (mirrors
 * `getSignupQualityScoreDimensionBreakdownForProject`'s own two-metric
 * query shape). Never throws for an expected, per-query-recoverable
 * outcome — mirrors `queryBoardTile`'s (KAN-60) own catch-and-classify
 * posture.
 */
export async function getFirmographicCompositionDimensionBreakdownForProject(
  organizationId: string,
  projectId: string,
  dimension: FirmographicBreakdownDimension,
  overrides?: WarehouseQueryOverrides,
): Promise<FirmographicQueryOutcome> {
  try {
    const result = await queryMetrics({
      organizationId,
      projectId,
      executor: overrides?.executor,
      cache: overrides?.cache,
      request: {
        metrics: ['firmographic_profiles_total', 'firmographic_mrr_total'],
        dimensions: [dimension],
        // A lifetime breakdown, not a windowed one — same `grain: 'year'` reasoning
        // `getCancellationReasonDimensionBreakdownForProject` documents for minimizing
        // (not guaranteeing) a single bucket per dimension value; safe here regardless
        // since both metrics are sum-shaped and the caller folds by addition.
        time: { start: '1970-01-01', end: '2999-12-31', grain: 'year' },
      },
    });
    return { ok: true, rows: result.series };
  } catch (error) {
    return classifyMetricQueryError(error);
  }
}

/** A project's currently `active` composition-shift alert episodes, newest-first by when they were first detected. */
export async function listActiveFirmographicCompositionAlertsForProject(
  organizationId: string,
  projectId: string,
): Promise<FirmographicCompositionAlertModel[]> {
  return FirmographicCompositionAlertModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('status', '==', 'active')
    .orderBy('detected_at', 'desc')
    .get();
}

/** A project's composition-shift alert history (active and resolved episodes), ordered by most-recently-checked first. */
export async function listFirmographicCompositionAlertsForProject(
  organizationId: string,
  projectId: string,
): Promise<FirmographicCompositionAlertModel[]> {
  return FirmographicCompositionAlertModel.initPath({ organization_id: organizationId, project_id: projectId }).query().orderBy('last_checked_at', 'desc').get();
}

interface IndustryWindowTotals {
  count: number;
}

/** A warehouse cell can come back typed (`number`) or stringified (`string`) depending on the executor (`WarehouseRow = Record<string, string | number | null>`) — coerces either into a finite number, defaulting a `null`/unparseable cell to 0, same tolerant-coercion posture `toWarehouseNumber` (quality-score.service.ts) establishes for the identical class of value. */
function toWarehouseNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

/** Folds a `firmographic_profiles_total` series into per-industry `{count}` totals — sums (never averages) across any repeated `bucket_date` rows, same safety reasoning `foldChannelWindowTotals` (quality-score.service.ts) documents. */
function foldIndustryWindowTotals(rows: readonly WarehouseRow[]): Map<string, IndustryWindowTotals> {
  const totals = new Map<string, IndustryWindowTotals>();
  for (const row of rows) {
    const industry = String(row.industry ?? '');
    const count = toWarehouseNumber(row.firmographic_profiles_total);
    const existing = totals.get(industry) ?? { count: 0 };
    totals.set(industry, { count: existing.count + count });
  }
  return totals;
}

export interface FirmographicCompositionAlertCheckIndustryOutcome {
  industry: string;
  action: CompositionShiftAction;
  baselineShare: number;
  baselineSampleSize: number;
  currentShare: number;
  currentSampleSize: number;
  alert: FirmographicCompositionAlertModel | null;
}

export type FirmographicCompositionAlertCheckResult =
  | { ok: true; checkedAt: string; industries: FirmographicCompositionAlertCheckIndustryOutcome[] }
  | (FirmographicQueryOutcome & { ok: false });

async function evaluateIndustryForCompositionAlert(
  organizationId: string,
  projectId: string,
  industry: string,
  baselineShare: number,
  baselineTotal: number,
  currentShare: number,
  currentTotal: number,
  nowIso: string,
  existingAlert: FirmographicCompositionAlertModel | undefined,
): Promise<FirmographicCompositionAlertCheckIndustryOutcome> {
  const evaluation = evaluateCompositionShift({
    baselineShare,
    baselineSampleSize: baselineTotal,
    currentShare,
    currentSampleSize: currentTotal,
    isCurrentlyActive: existingAlert !== undefined,
  });

  if (evaluation.action === 'fire') {
    const alert = new FirmographicCompositionAlertModel();
    alert.organization_id = organizationId;
    alert.project_id = projectId;
    alert.industry = industry;
    alert.status = 'active';
    alert.trigger = MANUAL_TRIGGER;
    alert.detected_at = nowIso;
    alert.baseline_share = baselineShare;
    alert.current_share = currentShare;
    alert.delta = evaluation.delta;
    alert.last_checked_at = nowIso;
    alert.setPathParams({ organization_id: organizationId, project_id: projectId });
    await alert.save();
    return { industry, action: 'fire', baselineShare, baselineSampleSize: baselineTotal, currentShare, currentSampleSize: currentTotal, alert };
  }

  if (evaluation.action === 'still_active' && existingAlert) {
    existingAlert.current_share = currentShare;
    existingAlert.baseline_share = baselineShare;
    existingAlert.delta = evaluation.delta;
    existingAlert.last_checked_at = nowIso;
    await existingAlert.save();
    return { industry, action: 'still_active', baselineShare, baselineSampleSize: baselineTotal, currentShare, currentSampleSize: currentTotal, alert: existingAlert };
  }

  if (evaluation.action === 'resolve' && existingAlert) {
    existingAlert.status = 'resolved';
    existingAlert.resolved_at = nowIso;
    existingAlert.current_share = currentShare;
    existingAlert.delta = evaluation.delta;
    existingAlert.last_checked_at = nowIso;
    await existingAlert.save();
    return { industry, action: 'resolve', baselineShare, baselineSampleSize: baselineTotal, currentShare, currentSampleSize: currentTotal, alert: existingAlert };
  }

  // 'healthy' or 'insufficient_data' — nothing to write, mirrors `evaluateChannelForMixAlert`'s
  // (quality-score.service.ts) own "don't touch state we can't fairly evaluate" posture.
  return {
    industry,
    action: evaluation.action,
    baselineShare,
    baselineSampleSize: baselineTotal,
    currentShare,
    currentSampleSize: currentTotal,
    alert: existingAlert ?? null,
  };
}

/** Best-effort audit entry for one check that changed at least one industry's alert state — see `recordAuditLogEntry`'s own doc comment for why a failure here is swallowed. Skipped when there's no human actor or nothing changed, same posture `recordQualityMixAlertCheckAudit` (quality-score.service.ts) already uses. */
async function recordFirmographicCompositionAlertCheckAudit(
  organizationId: string,
  projectId: string,
  changed: readonly FirmographicCompositionAlertCheckIndustryOutcome[],
  performedByUserId: string | undefined,
): Promise<void> {
  if (!performedByUserId || changed.length === 0) {
    return;
  }
  try {
    await recordAuditLogEntry({
      organizationId,
      projectId,
      actorType: 'user',
      actorId: performedByUserId,
      action: 'firmographic_composition_alert.check',
      targetType: 'project',
      targetId: projectId,
      summary: `Checked firmographic composition-shift alerts -> ${changed.map((outcome) => `${outcome.industry}:${outcome.action}`).join(', ')}`,
      after: { changes: changed.map((outcome) => ({ industry: outcome.industry, action: outcome.action, delta: outcome.currentShare - outcome.baselineShare })) },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }
}

export interface CheckFirmographicCompositionAlertsParams extends WarehouseQueryOverrides {
  organizationId: string;
  projectId: string;
  /** The human who triggered this check, if any — recorded on the audit entry when present. Omit for a future non-human caller (a real scheduler, once KAN-18 exists). */
  triggeredByUserId?: string;
  /** Injectable clock for deterministic tests — defaults to `Date.now()`. */
  now?: number;
}

/**
 * Manually checks every industry's share of the customer base "right now"
 * (KAN-87, plan `14 §Gap 11`: "composition-shift alerts") — the
 * buildable-today "check now" stand-in for a real scheduled check, same
 * posture `checkQualityMixAlertsForProject` (KAN-83) already establishes
 * for its own alert family. Compares each industry's share of newly-landed
 * firmographic profiles over the current
 * {@link FIRMOGRAPHIC_COMPOSITION_ALERT_WINDOW_DAYS}-day window against the
 * same-length baseline window immediately before it, via
 * `evaluateCompositionShift` (`@growthos/shared`) — see that function's own
 * doc comment for the threshold/hysteresis reasoning. Requires the
 * warehouse-backed `fact_company_firmographic` mart, same degrade-cleanly-
 * not-crash posture `getCancellationReasonDimensionBreakdownForProject`
 * establishes.
 *
 * Not transactional, the same documented, deliberately-deferred tradeoff
 * `checkQualityMixAlertsForProject`'s own doc comment already accepts for
 * its own equivalent existence-check race.
 */
export async function checkFirmographicCompositionAlertsForProject(
  params: CheckFirmographicCompositionAlertsParams,
): Promise<FirmographicCompositionAlertCheckResult> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const nowMs = params.now ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const windowMs = FIRMOGRAPHIC_COMPOSITION_ALERT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const currentStart = new Date(nowMs - windowMs).toISOString().slice(0, 10);
  const currentEnd = new Date(nowMs).toISOString().slice(0, 10);
  const baselineStart = new Date(nowMs - 2 * windowMs).toISOString().slice(0, 10);
  const baselineEnd = currentStart;

  let currentRows: WarehouseRow[];
  let baselineRows: WarehouseRow[];
  try {
    const [currentResult, baselineResult] = await Promise.all([
      queryMetrics({
        organizationId: params.organizationId,
        projectId: params.projectId,
        executor: params.executor,
        cache: params.cache,
        request: {
          metrics: ['firmographic_profiles_total'],
          dimensions: ['industry'],
          time: { start: currentStart, end: currentEnd, grain: 'year' },
        },
      }),
      queryMetrics({
        organizationId: params.organizationId,
        projectId: params.projectId,
        executor: params.executor,
        cache: params.cache,
        request: {
          metrics: ['firmographic_profiles_total'],
          dimensions: ['industry'],
          time: { start: baselineStart, end: baselineEnd, grain: 'year' },
        },
      }),
    ]);
    currentRows = currentResult.series;
    baselineRows = baselineResult.series;
  } catch (error) {
    return classifyMetricQueryError(error) as FirmographicCompositionAlertCheckResult;
  }

  const currentTotals = foldIndustryWindowTotals(currentRows);
  const baselineTotals = foldIndustryWindowTotals(baselineRows);
  const industries = new Set([...currentTotals.keys(), ...baselineTotals.keys()]);

  const currentGrandTotal = [...currentTotals.values()].reduce((sum, totals) => sum + totals.count, 0);
  const baselineGrandTotal = [...baselineTotals.values()].reduce((sum, totals) => sum + totals.count, 0);

  const existingActiveAlerts = await listActiveFirmographicCompositionAlertsForProject(params.organizationId, params.projectId);
  const activeAlertByIndustry = new Map(existingActiveAlerts.map((alert) => [alert.industry, alert]));

  const outcomes = await Promise.all(
    [...industries].map((industry) => {
      const currentCount = currentTotals.get(industry)?.count ?? 0;
      const baselineCount = baselineTotals.get(industry)?.count ?? 0;
      const currentShare = currentGrandTotal > 0 ? currentCount / currentGrandTotal : 0;
      const baselineShare = baselineGrandTotal > 0 ? baselineCount / baselineGrandTotal : 0;
      return evaluateIndustryForCompositionAlert(
        params.organizationId,
        params.projectId,
        industry,
        baselineShare,
        baselineGrandTotal,
        currentShare,
        currentGrandTotal,
        nowIso,
        activeAlertByIndustry.get(industry),
      );
    }),
  );

  const changed = outcomes.filter((outcome) => outcome.action === 'fire' || outcome.action === 'resolve');
  await recordFirmographicCompositionAlertCheckAudit(params.organizationId, params.projectId, changed, params.triggeredByUserId);

  return { ok: true, checkedAt: nowIso, industries: outcomes.sort((a, b) => a.industry.localeCompare(b.industry)) };
}
