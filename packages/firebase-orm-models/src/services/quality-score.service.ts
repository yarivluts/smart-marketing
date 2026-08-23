import {
  computeSignupQualityScoreDistribution,
  evaluateQualityMixShift,
  MetricCompilerError,
  ONBOARDING_SURVEY_SCHEMA_KIND,
  ONBOARDING_SURVEY_SCHEMA_NAME,
  type QualityMixShiftAction,
  type SignupQualityScoreDistribution,
} from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import type { RawRecordModel } from '../models/raw-record.model';
import { QualityMixAlertModel } from '../models/quality-mix-alert.model';
import { ProjectNotFoundError } from './resource-library.service';
import { listRecentRecordsForSchemas } from './pipeline.service';
import { MetricNotRegisteredError, MetricTargetsUnbuiltWarehouseTableError } from './metrics-compiler.service';
import { ProjectQueryQuotaExceededError } from './cost-guardrail.service';
import { queryMetrics } from './metrics-query.service';
import { recordAuditLogEntry } from './audit-log.service';
import { WarehouseNotConfiguredError, WarehouseQueryFailedError, type WarehouseQueryExecutor, type WarehouseRow } from '../warehouse/query-executor';
import type { MetricQueryResultCache } from '../warehouse/result-cache';

/** Test-only injection seam shared by every warehouse-backed function below — production callers never pass these, `queryMetrics` defaults to the real executor/cache (see its own doc comment). */
interface WarehouseQueryOverrides {
  executor?: WarehouseQueryExecutor;
  cache?: MetricQueryResultCache;
}

/** Same load-bounding reasoning as `DEFAULT_NPS_OVERVIEW_RECORD_LIMIT` (KAN-82)/`DEFAULT_CANCELLATION_REASON_RECORD_LIMIT` (KAN-84) — bounds Firestore read cost until a real aggregation store exists. */
export const DEFAULT_SIGNUP_QUALITY_SCORE_RECORD_LIMIT = 500;

/** The `quality_adjusted_cost_per_signup`/`quality_adjusted_cac` headline figures' own trailing window — a common CAC-reporting horizon, short enough that a single `grain: 'year'` bucket almost always covers it whole (see `getSignupQualityScoreAdjustedMetricsForProject`'s own doc comment on why that matters). */
export const DEFAULT_QUALITY_ADJUSTED_METRICS_WINDOW_DAYS = 90;

/** The mix-shift check's own current/baseline window size (KAN-83, plan `14 §Gap 4`) — pairs with `evaluateQualityMixShift`'s (`@growthos/shared`) fire/resolve thresholds. 14 days smooths day-of-week noise while staying responsive within two weeks; the gap doc's own "classic Meta failure mode" typically plays out over days-to-weeks, not hours. */
export const QUALITY_MIX_ALERT_WINDOW_DAYS = 14;

const MANUAL_TRIGGER = 'manual' as const;

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

interface ParsedOnboardingSurvey {
  readonly qualityScore: number;
  readonly landedAt: string;
}

/** Tolerantly parses one landed `onboarding_survey` raw record. Returns `null` when the payload carries no numeric `quality_score` — the same "malformed data doesn't crash the read" posture `parseNpsResponse`/`parseCancellationReason` establish. */
function parseOnboardingSurvey(record: RawRecordModel): ParsedOnboardingSurvey | null {
  const properties = record.payload.properties;
  if (typeof properties !== 'object' || properties === null) return null;
  const props = properties as Record<string, unknown>;

  const rawScore = props.quality_score;
  const qualityScore = typeof rawScore === 'number' ? rawScore : typeof rawScore === 'string' ? Number(rawScore) : NaN;
  if (!Number.isFinite(qualityScore)) return null;

  return { qualityScore, landedAt: record.landed_at };
}

/**
 * The bounded, landed `onboarding_survey` raw records every read below
 * shares — exported so a caller needing more than one of them (the Intent &
 * Quality admin page) can fetch once and pass the result via
 * `precomputedRecords`, same pass-through convention
 * `listCancellationReasonRecordsForProject` (KAN-84) established.
 */
export async function listOnboardingSurveyRecordsForProject(
  organizationId: string,
  projectId: string,
  limit: number = DEFAULT_SIGNUP_QUALITY_SCORE_RECORD_LIMIT,
): Promise<RawRecordModel[]> {
  return listRecentRecordsForSchemas({
    organizationId,
    projectId,
    kind: ONBOARDING_SURVEY_SCHEMA_KIND,
    schemaNames: [ONBOARDING_SURVEY_SCHEMA_NAME],
    limit,
  });
}

/**
 * The score-distribution panel's own data: every landed signup's
 * `quality_score`, bucketed low/medium/high plus the plain average —
 * computed fresh from bounded, landed raw records, folded across every
 * environment (same "whole project" posture `listRecentBillingEventsForProject`,
 * KAN-80, established), no warehouse required — same posture
 * `getNpsOverviewForProject`'s own Firestore-side computation.
 */
export async function getSignupQualityScoreOverviewForProject(
  organizationId: string,
  projectId: string,
  options?: { limit?: number; precomputedRecords?: RawRecordModel[] },
): Promise<SignupQualityScoreDistribution> {
  await requireProjectInOrg(organizationId, projectId);
  const limit = options?.limit ?? DEFAULT_SIGNUP_QUALITY_SCORE_RECORD_LIMIT;
  const records = options?.precomputedRecords ?? (await listOnboardingSurveyRecordsForProject(organizationId, projectId, limit));
  const scores = records.map(parseOnboardingSurvey).filter((r): r is ParsedOnboardingSurvey => r !== null).map((r) => r.qualityScore);
  return computeSignupQualityScoreDistribution(scores);
}

export type SignupQualityScoreQueryOutcome =
  | { ok: true; rows: WarehouseRow[] }
  | { ok: false; reason: 'warehouse_not_configured' | 'quota_exceeded' | 'not_yet_backed' | 'query_error'; message: string };

function classifyMetricQueryError(error: unknown): SignupQualityScoreQueryOutcome {
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

/** Every dimension `signup_quality_score_sum`/`signups_scored` (`quality-score-pack/metrics.ts`) both declare — the channel/cohort breakdown axes the AC names. */
export type SignupQualityScoreBreakdownDimension = 'channel_id' | 'cohort_month';

/**
 * The warehouse-backed half of the AC — "score distribution ... by channel"
 * — one query against `fact_signup_quality_score` returning BOTH
 * `signup_quality_score_sum` and `signups_scored` broken down by
 * `dimension`, reusing the existing metrics/dimension-breakdown machinery
 * exactly the way a board table tile would (mirrors
 * `getCancellationReasonDimensionBreakdownForProject`, KAN-84). Deliberately
 * queries the two `sum`/`count_distinct` aggregations rather than the
 * `avg_signup_quality_score` formula metric directly: a `GROUP BY` result
 * can legitimately return more than one row per dimension value (the
 * compiler always time-buckets, see `compiler.ts`'s own doc comment), and a
 * caller folding multiple rows for the same dimension value must *sum* them
 * to stay correct — which is safe for `sum`/`count_distinct` but would
 * silently corrupt an already-averaged value (averaging averages needs
 * per-bucket sample-size weighting, which nothing in this call chain
 * carries). The caller (the admin page's own view mapper) sums both series
 * per dimension value, then divides once at the very end.
 */
export async function getSignupQualityScoreDimensionBreakdownForProject(
  organizationId: string,
  projectId: string,
  dimension: SignupQualityScoreBreakdownDimension,
  overrides?: WarehouseQueryOverrides,
): Promise<SignupQualityScoreQueryOutcome> {
  try {
    const result = await queryMetrics({
      organizationId,
      projectId,
      executor: overrides?.executor,
      cache: overrides?.cache,
      request: {
        metrics: ['signup_quality_score_sum', 'signups_scored'],
        dimensions: [dimension],
        // A lifetime breakdown, not a windowed one — same `grain: 'year'`
        // reasoning `getCancellationReasonDimensionBreakdownForProject`
        // documents for minimizing (not guaranteeing) a single bucket per
        // dimension value; safe here regardless since both metrics are
        // sum-shaped and the caller folds by addition.
        time: { start: '1970-01-01', end: '2999-12-31', grain: 'year' },
      },
    });
    return { ok: true, rows: result.series };
  } catch (error) {
    return classifyMetricQueryError(error);
  }
}

export interface SignupQualityScoreAdjustedMetrics {
  /** `null` when the underlying series returned no rows (e.g. zero signups in the window) — a compiled `SAFE_DIVIDE` against a zero/absent denominator, not a crash. */
  costPerSignup: number | null;
  cac: number | null;
}

export type SignupQualityScoreAdjustedMetricsOutcome = { ok: true; metrics: SignupQualityScoreAdjustedMetrics } | (SignupQualityScoreQueryOutcome & { ok: false });

/**
 * The headline "quality-adjusted CAC/CPS" figures (KAN-83's own AC name) —
 * `quality_adjusted_cost_per_signup`/`quality_adjusted_cac` queried with no
 * dimension breakdown over a bounded trailing window (`windowDays`, default
 * {@link DEFAULT_QUALITY_ADJUSTED_METRICS_WINDOW_DAYS}) rather than this
 * module's other functions' "lifetime" query: a bounded, recent window is
 * what "what's my CAC right now" actually means for these two ratio
 * metrics, and keeping it short makes a `grain: 'year'` single-bucket result
 * far more likely (a formula-kind metric's ratio can't be safely re-averaged
 * across more than one bucket the way a sum-shaped metric can — see
 * `getSignupQualityScoreDimensionBreakdownForProject`'s own doc comment for
 * why that distinction matters and why this function avoids it by staying
 * windowed instead).
 */
export async function getSignupQualityScoreAdjustedMetricsForProject(
  organizationId: string,
  projectId: string,
  options?: { windowDays?: number; now?: number } & WarehouseQueryOverrides,
): Promise<SignupQualityScoreAdjustedMetricsOutcome> {
  const windowDays = options?.windowDays ?? DEFAULT_QUALITY_ADJUSTED_METRICS_WINDOW_DAYS;
  const now = options?.now ?? Date.now();
  const start = new Date(now - windowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const end = new Date(now).toISOString().slice(0, 10);

  try {
    const result = await queryMetrics({
      organizationId,
      projectId,
      executor: options?.executor,
      cache: options?.cache,
      request: {
        metrics: ['quality_adjusted_cost_per_signup', 'quality_adjusted_cac'],
        dimensions: [],
        time: { start, end, grain: 'year' },
      },
    });
    const row = result.series[0];
    const costPerSignup = row && row.quality_adjusted_cost_per_signup !== null ? toWarehouseNumber(row.quality_adjusted_cost_per_signup) : null;
    const cac = row && row.quality_adjusted_cac !== null ? toWarehouseNumber(row.quality_adjusted_cac) : null;
    return { ok: true, metrics: { costPerSignup, cac } };
  } catch (error) {
    return classifyMetricQueryError(error) as SignupQualityScoreAdjustedMetricsOutcome;
  }
}

/** A project's currently `active` mix-shift alert episodes, newest-first by when they were first detected. */
export async function listActiveQualityMixAlertsForProject(organizationId: string, projectId: string): Promise<QualityMixAlertModel[]> {
  return QualityMixAlertModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('status', '==', 'active')
    .orderBy('detected_at', 'desc')
    .get();
}

/** A project's mix-shift alert history (active and resolved episodes), ordered by most-recently-checked first. */
export async function listQualityMixAlertsForProject(organizationId: string, projectId: string): Promise<QualityMixAlertModel[]> {
  return QualityMixAlertModel.initPath({ organization_id: organizationId, project_id: projectId }).query().orderBy('last_checked_at', 'desc').get();
}

interface ChannelWindowTotals {
  sumScore: number;
  count: number;
}

/** A warehouse cell can come back typed (`number`) or stringified (`string`) depending on the executor (`WarehouseRow = Record<string, string | number | null>`) — coerces either into a finite number, defaulting a `null`/unparseable cell to 0, same tolerant-coercion posture `toNumber` (`apps/web/lib/orgs/board-view.ts`) establishes for the identical class of value. */
function toWarehouseNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

/** Folds a `signup_quality_score_sum`/`signups_scored` two-metric series into per-channel `{sumScore, count}` totals — sums (never averages) across any repeated `bucket_date` rows, the same safety reasoning `getSignupQualityScoreDimensionBreakdownForProject`'s own doc comment gives. */
function foldChannelWindowTotals(rows: readonly WarehouseRow[]): Map<string, ChannelWindowTotals> {
  const totals = new Map<string, ChannelWindowTotals>();
  for (const row of rows) {
    const channelId = String(row.channel_id ?? '');
    const sumScore = toWarehouseNumber(row.signup_quality_score_sum);
    const count = toWarehouseNumber(row.signups_scored);
    const existing = totals.get(channelId) ?? { sumScore: 0, count: 0 };
    totals.set(channelId, { sumScore: existing.sumScore + sumScore, count: existing.count + count });
  }
  return totals;
}

export interface QualityMixAlertCheckChannelOutcome {
  channelId: string;
  action: QualityMixShiftAction;
  baselineAvgScore: number;
  baselineSampleSize: number;
  currentAvgScore: number;
  currentSampleSize: number;
  alert: QualityMixAlertModel | null;
}

export type QualityMixAlertCheckResult =
  | { ok: true; checkedAt: string; channels: QualityMixAlertCheckChannelOutcome[] }
  | (SignupQualityScoreQueryOutcome & { ok: false });

async function evaluateChannelForMixAlert(
  organizationId: string,
  projectId: string,
  channelId: string,
  baseline: ChannelWindowTotals,
  current: ChannelWindowTotals,
  nowIso: string,
  existingAlert: QualityMixAlertModel | undefined,
): Promise<QualityMixAlertCheckChannelOutcome> {
  const baselineAvgScore = baseline.count > 0 ? baseline.sumScore / baseline.count : 0;
  const currentAvgScore = current.count > 0 ? current.sumScore / current.count : 0;

  const evaluation = evaluateQualityMixShift({
    baselineAvgScore,
    baselineSampleSize: baseline.count,
    currentAvgScore,
    currentSampleSize: current.count,
    isCurrentlyActive: existingAlert !== undefined,
  });

  if (evaluation.action === 'fire') {
    const alert = new QualityMixAlertModel();
    alert.organization_id = organizationId;
    alert.project_id = projectId;
    alert.channel_id = channelId;
    alert.status = 'active';
    alert.trigger = MANUAL_TRIGGER;
    alert.detected_at = nowIso;
    alert.baseline_avg_score = baselineAvgScore;
    alert.current_avg_score = currentAvgScore;
    alert.delta = evaluation.delta;
    alert.last_checked_at = nowIso;
    alert.setPathParams({ organization_id: organizationId, project_id: projectId });
    await alert.save();
    return { channelId, action: 'fire', baselineAvgScore, baselineSampleSize: baseline.count, currentAvgScore, currentSampleSize: current.count, alert };
  }

  if (evaluation.action === 'still_active' && existingAlert) {
    existingAlert.current_avg_score = currentAvgScore;
    existingAlert.baseline_avg_score = baselineAvgScore;
    existingAlert.delta = evaluation.delta;
    existingAlert.last_checked_at = nowIso;
    await existingAlert.save();
    return { channelId, action: 'still_active', baselineAvgScore, baselineSampleSize: baseline.count, currentAvgScore, currentSampleSize: current.count, alert: existingAlert };
  }

  if (evaluation.action === 'resolve' && existingAlert) {
    existingAlert.status = 'resolved';
    existingAlert.resolved_at = nowIso;
    existingAlert.current_avg_score = currentAvgScore;
    existingAlert.delta = evaluation.delta;
    existingAlert.last_checked_at = nowIso;
    await existingAlert.save();
    return { channelId, action: 'resolve', baselineAvgScore, baselineSampleSize: baseline.count, currentAvgScore, currentSampleSize: current.count, alert: existingAlert };
  }

  // 'healthy' or 'insufficient_data' — nothing to write, mirrors
  // `evaluateEventForAlert`'s own "don't touch state we can't fairly
  // evaluate, or that needs no change" posture.
  return { channelId, action: evaluation.action, baselineAvgScore, baselineSampleSize: baseline.count, currentAvgScore, currentSampleSize: current.count, alert: existingAlert ?? null };
}

/** Best-effort audit entry for one check that changed at least one channel's alert state — see `recordAuditLogEntry`'s own doc comment for why a failure here is swallowed. Skipped when there's no human actor or nothing changed, same posture `recordTrackingAlertCheckAudit` (KAN-36) already uses. */
async function recordQualityMixAlertCheckAudit(
  organizationId: string,
  projectId: string,
  changed: readonly QualityMixAlertCheckChannelOutcome[],
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
      action: 'quality_mix_alert.check',
      targetType: 'project',
      targetId: projectId,
      summary: `Checked signup quality mix-shift alerts -> ${changed.map((outcome) => `${outcome.channelId}:${outcome.action}`).join(', ')}`,
      after: { changes: changed.map((outcome) => ({ channelId: outcome.channelId, action: outcome.action, delta: outcome.currentAvgScore - outcome.baselineAvgScore })) },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }
}

export interface CheckQualityMixAlertsParams extends WarehouseQueryOverrides {
  organizationId: string;
  projectId: string;
  /** The human who triggered this check, if any — recorded on the audit entry when present. Omit for a future non-human caller (a real scheduler, once KAN-18 exists). */
  triggeredByUserId?: string;
  /** Injectable clock for deterministic tests — defaults to `Date.now()`. */
  now?: number;
}

/**
 * Manually checks every marketing channel's signup-quality mix "right now"
 * (KAN-83, plan `14 §Gap 4`: "alert when a channel's intent mix degrades
 * even if CPS looks fine") — the buildable-today "check now" stand-in for a
 * real scheduled check, same posture `checkTrackingAlertsForProject`
 * (KAN-36) already establishes for its own alert family. Compares each
 * channel's average quality score over the current
 * {@link QUALITY_MIX_ALERT_WINDOW_DAYS}-day window against the same-length
 * baseline window immediately before it, via `evaluateQualityMixShift`
 * (`@growthos/shared`) — see that function's own doc comment for the
 * threshold/hysteresis reasoning. Requires the warehouse-backed
 * `fact_signup_quality_score` mart (same degrade-cleanly-not-crash posture
 * `getCancellationReasonDimensionBreakdownForProject` establishes) since
 * "by channel" is a warehouse-join concept `TrackingAlertModel`'s own
 * Firestore-only check never needed.
 *
 * Not transactional, the same documented, deliberately-deferred gap
 * `checkTrackingAlertsForProject`'s own doc comment already accepts for its
 * own equivalent existence-check race.
 */
export async function checkQualityMixAlertsForProject(params: CheckQualityMixAlertsParams): Promise<QualityMixAlertCheckResult> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const nowMs = params.now ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const windowMs = QUALITY_MIX_ALERT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

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
          metrics: ['signup_quality_score_sum', 'signups_scored'],
          dimensions: ['channel_id'],
          time: { start: currentStart, end: currentEnd, grain: 'year' },
        },
      }),
      queryMetrics({
        organizationId: params.organizationId,
        projectId: params.projectId,
        executor: params.executor,
        cache: params.cache,
        request: {
          metrics: ['signup_quality_score_sum', 'signups_scored'],
          dimensions: ['channel_id'],
          time: { start: baselineStart, end: baselineEnd, grain: 'year' },
        },
      }),
    ]);
    currentRows = currentResult.series;
    baselineRows = baselineResult.series;
  } catch (error) {
    return classifyMetricQueryError(error) as QualityMixAlertCheckResult;
  }

  const currentTotals = foldChannelWindowTotals(currentRows);
  const baselineTotals = foldChannelWindowTotals(baselineRows);
  const channelIds = new Set([...currentTotals.keys(), ...baselineTotals.keys()]);

  const existingActiveAlerts = await listActiveQualityMixAlertsForProject(params.organizationId, params.projectId);
  const activeAlertByChannel = new Map(existingActiveAlerts.map((alert) => [alert.channel_id, alert]));

  const channels = await Promise.all(
    [...channelIds].map((channelId) =>
      evaluateChannelForMixAlert(
        params.organizationId,
        params.projectId,
        channelId,
        baselineTotals.get(channelId) ?? { sumScore: 0, count: 0 },
        currentTotals.get(channelId) ?? { sumScore: 0, count: 0 },
        nowIso,
        activeAlertByChannel.get(channelId),
      ),
    ),
  );

  const changed = channels.filter((outcome) => outcome.action === 'fire' || outcome.action === 'resolve');
  await recordQualityMixAlertCheckAudit(params.organizationId, params.projectId, changed, params.triggeredByUserId);

  return { ok: true, checkedAt: nowIso, channels: channels.sort((a, b) => a.channelId.localeCompare(b.channelId)) };
}
