import { createHash } from 'node:crypto';
import { MetricCompilerError } from '@growthos/shared';
import { CampaignTargetModel } from '../models/campaign-target.model';
import { ProjectModel } from '../models/project.model';
import { ProjectNotFoundError } from './resource-library.service';
import { MetricNotRegisteredError, MetricTargetsUnbuiltWarehouseTableError } from './metrics-compiler.service';
import { ProjectQueryQuotaExceededError } from './cost-guardrail.service';
import { queryMetrics } from './metrics-query.service';
import type { MetricQueryResultCache } from '../warehouse/result-cache';
import { WarehouseNotConfiguredError, WarehouseQueryFailedError, type WarehouseQueryExecutor, type WarehouseRow } from '../warehouse/query-executor';

/** `ad_spend`'s own name in the SaaS metric pack (`saas-metric-pack/metrics.ts`) — the one metric this codebase carries a `campaign_id` dimension on today, see `CampaignTargetModel`'s own doc comment. */
export const CAMPAIGN_SPEND_METRIC_NAME = 'ad_spend';
/** How far back the "actual spend" breakdown looks — a rolling window rather than a calendar month, so a target set mid-month still has something to compare against immediately. */
export const CAMPAIGN_SPEND_TRAILING_WINDOW_DAYS = 30;

export class InvalidCampaignTargetError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Invalid campaign target: ${reasons.join('; ')}`);
    this.name = 'InvalidCampaignTargetError';
  }
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

/**
 * Deterministic Firestore document id for a campaign's target, derived from
 * the raw `campaign_id` string rather than using it verbatim — see
 * `CampaignTargetModel`'s own doc comment on why (arbitrary third-party
 * string, may contain characters Firestore ids reject).
 */
export function campaignTargetDocId(campaignId: string): string {
  return createHash('sha256').update(campaignId).digest('hex');
}

export interface SetCampaignTargetBudgetParams {
  organizationId: string;
  projectId: string;
  campaignId: string;
  monthlyBudget: number;
  updatedByUserId: string;
}

/**
 * Creates or overwrites a campaign's spend budget target — one target per
 * (project, campaign_id), upserted by the deterministic doc id
 * {@link campaignTargetDocId} computes, the same "content-hashed key so a
 * caller-supplied id is idempotent without a query first" posture
 * `ingest.service.ts`'s dedup keys establish.
 */
export async function setCampaignTargetBudget(params: SetCampaignTargetBudgetParams): Promise<CampaignTargetModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);

  const campaignId = params.campaignId.trim();
  const reasons: string[] = [];
  if (campaignId.length === 0) {
    reasons.push('campaignId must be a non-empty string.');
  }
  if (!Number.isFinite(params.monthlyBudget) || params.monthlyBudget < 0) {
    reasons.push('monthlyBudget must be a finite number >= 0.');
  }
  if (reasons.length > 0) {
    throw new InvalidCampaignTargetError(reasons);
  }

  const docId = campaignTargetDocId(campaignId);
  const now = new Date().toISOString();
  const existing = await CampaignTargetModel.init(docId, { organization_id: params.organizationId, project_id: params.projectId });

  const target = existing ?? new CampaignTargetModel();
  target.organization_id = params.organizationId;
  target.project_id = params.projectId;
  target.campaign_id = campaignId;
  target.monthly_budget = params.monthlyBudget;
  target.updated_by = params.updatedByUserId;
  target.updated_at = now;
  if (!existing) {
    target.created_by = params.updatedByUserId;
    target.created_at = now;
  }
  target.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await target.save(docId);
  return target;
}

/** Removes a campaign's spend target — it reverts to "no target" (`CampaignSpendRow.monthlyBudget === null`) rather than a zero budget. */
export async function deleteCampaignTargetBudget(organizationId: string, projectId: string, campaignId: string): Promise<void> {
  await requireProjectInOrg(organizationId, projectId);
  const docId = campaignTargetDocId(campaignId.trim());
  const existing = await CampaignTargetModel.init(docId, { organization_id: organizationId, project_id: projectId });
  if (existing) {
    await existing.delete();
  }
}

export async function listCampaignTargetsForProject(organizationId: string, projectId: string): Promise<CampaignTargetModel[]> {
  await requireProjectInOrg(organizationId, projectId);
  return CampaignTargetModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .get();
}

export type CampaignSpendStatus = 'no_target' | 'on_target' | 'over_target';

export interface CampaignSpendRow {
  campaignId: string;
  actualSpend: number;
  monthlyBudget: number | null;
  status: CampaignSpendStatus;
}

export type CampaignSpendBreakdownOutcome =
  | { ok: true; rows: CampaignSpendRow[] }
  | { ok: false; reason: 'warehouse_not_configured' | 'quota_exceeded' | 'not_yet_backed' | 'query_error'; message: string };

function sumByCampaign(rows: readonly WarehouseRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const campaignId = String(row.campaign_id ?? '');
    if (campaignId.length === 0) {
      continue;
    }
    const raw = row[CAMPAIGN_SPEND_METRIC_NAME] ?? null;
    const num = raw === null ? 0 : typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(num)) {
      continue;
    }
    totals.set(campaignId, (totals.get(campaignId) ?? 0) + num);
  }
  return totals;
}

function toDateOnly(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The warehouse-backed half of KAN-86's "per-entity targets... driving
 * red/green in campaign tables" AC: `ad_spend` broken down by `campaign_id`
 * over the trailing {@link CAMPAIGN_SPEND_TRAILING_WINDOW_DAYS} days, merged
 * with every saved {@link CampaignTargetModel} in the project. A campaign
 * with a saved target but zero spend in the window still gets a row
 * (`actualSpend: 0`); a campaign with spend but no saved target gets
 * `monthlyBudget: null, status: 'no_target'` rather than being dropped —
 * a human needs to *see* an untargeted campaign to decide whether to target
 * it. Never throws for an expected, per-query-recoverable outcome — mirrors
 * `getCancellationReasonDimensionBreakdownForProject`'s own catch-and-
 * classify posture.
 */
export async function getCampaignSpendBreakdownForProject(
  organizationId: string,
  projectId: string,
  options?: { now?: number; executor?: WarehouseQueryExecutor; cache?: MetricQueryResultCache },
): Promise<CampaignSpendBreakdownOutcome> {
  const now = options?.now ?? Date.now();
  const windowStartMs = now - CAMPAIGN_SPEND_TRAILING_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  try {
    const [result, targets] = await Promise.all([
      queryMetrics({
        organizationId,
        projectId,
        request: {
          metrics: [CAMPAIGN_SPEND_METRIC_NAME],
          dimensions: ['campaign_id'],
          time: { start: toDateOnly(windowStartMs), end: toDateOnly(now), grain: 'month' },
        },
        ...(options?.executor ? { executor: options.executor } : {}),
        ...(options?.cache ? { cache: options.cache } : {}),
      }),
      listCampaignTargetsForProject(organizationId, projectId),
    ]);

    const actualByCampaign = sumByCampaign(result.series);
    const targetByCampaign = new Map(targets.map((target) => [target.campaign_id, target.monthly_budget]));
    const everyCampaignId = new Set([...actualByCampaign.keys(), ...targetByCampaign.keys()]);

    const rows: CampaignSpendRow[] = [...everyCampaignId].map((campaignId) => {
      const actualSpend = actualByCampaign.get(campaignId) ?? 0;
      const monthlyBudget = targetByCampaign.get(campaignId) ?? null;
      const status: CampaignSpendStatus = monthlyBudget === null ? 'no_target' : actualSpend > monthlyBudget ? 'over_target' : 'on_target';
      return { campaignId, actualSpend, monthlyBudget, status };
    });
    rows.sort((a, b) => b.actualSpend - a.actualSpend);

    return { ok: true, rows };
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

/** Every fixed window the Campaign Ops pack's `collection_Nd` metrics cover — see `fact_customer_payback.sql`'s own doc comment on why this is a fixed catalog, not a runtime-configurable N. */
export const COLLECTION_WINDOW_DAYS: readonly (7 | 14 | 30 | 40)[] = [7, 14, 30, 40];

export interface PaybackWindowValue {
  windowDays: 7 | 14 | 30 | 40;
  collectedRevenue: number;
}

export type PaybackOverviewOutcome =
  | { ok: true; windows: PaybackWindowValue[] }
  | { ok: false; reason: 'warehouse_not_configured' | 'quota_exceeded' | 'not_yet_backed' | 'query_error'; message: string };

/** Local mirror of `sumMetricRows` (`goal.service.ts`) — same reasoning that file's own copy gives for not sharing one across services. */
function sumMetricRows(rows: readonly WarehouseRow[], metricName: string): number {
  return rows.reduce((total, row) => {
    const raw = row[metricName] ?? null;
    if (raw === null) {
      return total;
    }
    const num = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(num) ? total + num : total;
  }, 0);
}

/**
 * The `collection_nd` half of KAN-86's AC: every fixed window's lifetime
 * total, one query for all four metrics at once (`queryMetrics` accepts a
 * metric list). A lifetime total, not a windowed one — same reasoning
 * `getCancellationReasonDimensionBreakdownForProject`'s own doc comment
 * gives for its `1970-01-01..2999-12-31` range.
 */
export async function getPaybackOverviewForProject(
  organizationId: string,
  projectId: string,
  options?: { executor?: WarehouseQueryExecutor; cache?: MetricQueryResultCache },
): Promise<PaybackOverviewOutcome> {
  try {
    const result = await queryMetrics({
      organizationId,
      projectId,
      request: {
        metrics: COLLECTION_WINDOW_DAYS.map((windowDays) => `collection_${windowDays}d`),
        dimensions: [],
        time: { start: '1970-01-01', end: '2999-12-31', grain: 'year' },
      },
      ...(options?.executor ? { executor: options.executor } : {}),
      ...(options?.cache ? { cache: options.cache } : {}),
    });

    const windows = COLLECTION_WINDOW_DAYS.map((windowDays) => ({
      windowDays,
      collectedRevenue: sumMetricRows(result.series, `collection_${windowDays}d`),
    }));
    return { ok: true, windows };
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

/** Fixed display order for the calibration breakdown — same "fixed catalog, not whatever the warehouse happens to return" posture {@link COLLECTION_WINDOW_DAYS} establishes; a tier with zero scored signups still gets a row (all zeros), not a gap. */
export const QUALITY_CALIBRATION_TIERS: readonly ('low' | 'medium' | 'high')[] = ['low', 'medium', 'high'];

export interface QualityCalibrationTierRow {
  qualityTier: 'low' | 'medium' | 'high';
  signups: number;
  payingSignups: number;
  /** `null` when `signups` is 0 — an undefined ratio, not a misleading `0`. */
  payingRate: number | null;
  collectedRevenue40d: number;
  /** `null` when `signups` is 0, same reasoning as {@link payingRate}. */
  avgCollectedRevenue40d: number | null;
}

export type QualityCalibrationBreakdownOutcome =
  | { ok: true; tiers: QualityCalibrationTierRow[] }
  | { ok: false; reason: 'warehouse_not_configured' | 'quota_exceeded' | 'not_yet_backed' | 'query_error'; message: string };

interface QualityCalibrationTierTotals {
  signups: number;
  payingSignups: number;
  collectedRevenue40d: number;
}

/** Folds the three calibration aggregations' series into per-tier totals — sums (never averages) across any repeated `bucket_date` rows, same safety reasoning `sumByCampaign`/`sumMetricRows` above already establish for this file's other breakdowns. */
function foldCalibrationTierTotals(rows: readonly WarehouseRow[]): Map<string, QualityCalibrationTierTotals> {
  const totals = new Map<string, QualityCalibrationTierTotals>();
  for (const row of rows) {
    const qualityTier = String(row.quality_tier ?? '');
    if (qualityTier.length === 0) continue;
    const existing = totals.get(qualityTier) ?? { signups: 0, payingSignups: 0, collectedRevenue40d: 0 };
    const rawSignups = row.quality_calibration_signups ?? null;
    const rawPaying = row.quality_calibration_paying_signups ?? null;
    const rawRevenue = row.quality_calibration_collected_revenue_40d ?? null;
    totals.set(qualityTier, {
      signups: existing.signups + (rawSignups === null ? 0 : Number(rawSignups) || 0),
      payingSignups: existing.payingSignups + (rawPaying === null ? 0 : Number(rawPaying) || 0),
      collectedRevenue40d: existing.collectedRevenue40d + (rawRevenue === null ? 0 : Number(rawRevenue) || 0),
    });
  }
  return totals;
}

/**
 * The predicted-vs-actual calibration view (KAN-86's own remaining AC
 * bullet, plan `14 §Gap 12`): every {@link QUALITY_CALIBRATION_TIERS} tier's
 * scored-signup count, paying-conversion rate, and average 40-day collected
 * revenue, all sourced from one query against the three phase-1 calibration
 * aggregations (`campaign-ops-pack/metrics.ts`) rather than the two
 * formula-kind metrics directly — same "sum/count first, divide once at the
 * end" reasoning `getSignupQualityScoreDimensionBreakdownForProject`'s own
 * doc comment gives (a formula-kind metric's ratio can't be safely
 * re-averaged across more than one `bucket_date` row). A lifetime breakdown,
 * not a windowed one, same reasoning `getPaybackOverviewForProject`'s own
 * query gives.
 */
export async function getQualityCalibrationBreakdownForProject(
  organizationId: string,
  projectId: string,
  options?: { executor?: WarehouseQueryExecutor; cache?: MetricQueryResultCache },
): Promise<QualityCalibrationBreakdownOutcome> {
  try {
    const result = await queryMetrics({
      organizationId,
      projectId,
      request: {
        metrics: ['quality_calibration_signups', 'quality_calibration_paying_signups', 'quality_calibration_collected_revenue_40d'],
        dimensions: ['quality_tier'],
        time: { start: '1970-01-01', end: '2999-12-31', grain: 'year' },
      },
      ...(options?.executor ? { executor: options.executor } : {}),
      ...(options?.cache ? { cache: options.cache } : {}),
    });

    const totalsByTier = foldCalibrationTierTotals(result.series);
    const tiers: QualityCalibrationTierRow[] = QUALITY_CALIBRATION_TIERS.map((qualityTier) => {
      const totals = totalsByTier.get(qualityTier) ?? { signups: 0, payingSignups: 0, collectedRevenue40d: 0 };
      return {
        qualityTier,
        signups: totals.signups,
        payingSignups: totals.payingSignups,
        payingRate: totals.signups > 0 ? totals.payingSignups / totals.signups : null,
        collectedRevenue40d: totals.collectedRevenue40d,
        avgCollectedRevenue40d: totals.signups > 0 ? totals.collectedRevenue40d / totals.signups : null,
      };
    });

    return { ok: true, tiers };
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
