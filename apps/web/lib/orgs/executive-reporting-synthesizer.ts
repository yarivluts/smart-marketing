import type { AutomationTargetView } from './automation-view';
import type { CampaignSpendBreakdownOutcome } from './queries';
import type { ExecutiveBlendedMetrics } from '@/lib/ai/copilot-types';

export type { ExecutiveBlendedMetrics };

export type ExecutiveTimeWindow = '7d' | '30d' | '90d';

export interface PeriodComparison {
  spendChangePct: number;
  cacChangePct: number;
  roasChangePct: number;
  conversionsChangePct?: number;
}

export interface ChannelSpendAllocationItem {
  platform: 'meta_ads' | 'google_ads' | 'simulated';
  label: string;
  /** Real measured spend. Channels are only emitted when there is spend to report. */
  spendUsd: number;
  percentage: number;
  /** Null when the blended figure this derives from was never measured. */
  roas: number | null;
  conversions: number | null;
  cacUsd: number | null;
  colorClass: string;
}

export interface ExecutiveReportData {
  metrics: ExecutiveBlendedMetrics;
  timeWindow: ExecutiveTimeWindow;
  channels: ChannelSpendAllocationItem[];
  rebalancingRecommendation?: {
    fromChannel: string;
    toChannel: string;
    suggestedShiftDailyUsd: number;
    projectedRevenueGainUsd: number;
    rationale: string;
  };
}

/**
 * Division-by-zero protected CAC calculator. Returns null when there is nothing to divide,
 * so an unmeasurable CAC stays unmeasured instead of reading as a free acquisition.
 */
export function calculateBlendedCac(spend: number, conversions: number): number | null {
  if (conversions <= 0) return null;
  return Number((spend / conversions).toFixed(2));
}

/** Division-by-zero protected ROAS calculator. Null when spend is zero or unknown. */
export function calculateBlendedRoas(revenue: number, spend: number): number | null {
  if (spend <= 0) return null;
  return Number((revenue / spend).toFixed(2));
}

export interface BuildExecutiveMetricsOptions {
  targets?: AutomationTargetView[];
  spendOutcome?: CampaignSpendBreakdownOutcome | null;
  timeWindow?: ExecutiveTimeWindow;
  // No `seed`: it only ever fed `getDeterministicFactor`, which scaled invented baselines per
  // project so they looked like measurements. Nothing here is seeded any more.
  overrides?: Partial<ExecutiveBlendedMetrics>;
}

/** Splits real per-campaign spend across the platforms the targets belong to. */
function sumRealSpendByPlatform(
  targets: readonly AutomationTargetView[],
  spendOutcome: CampaignSpendBreakdownOutcome | null,
): { meta: number; google: number; other: number; measuredCount: number } {
  const spendByCampaignId = new Map<string, number>();
  if (spendOutcome && spendOutcome.ok) {
    for (const row of spendOutcome.rows) {
      // Skipped rather than counted as zero: a null actualSpend means the
      // project has no spend data for the window, and folding that in as 0 would
      // make an unmeasured campaign look like a free one.
      if (row.actualSpend !== null) {
        spendByCampaignId.set(row.campaignId, row.actualSpend);
      }
    }
  }

  let meta = 0;
  let google = 0;
  let other = 0;
  let measuredCount = 0;

  for (const target of targets) {
    const spend =
      spendByCampaignId.get(target.campaignResourceName ?? target.id) ??
      spendByCampaignId.get(target.label);
    if (typeof spend !== 'number' || !Number.isFinite(spend)) {
      continue;
    }
    measuredCount += 1;

    const label = target.label.toLowerCase();
    const isMeta =
      target.externalPlatform === 'meta_ads' ||
      label.includes('meta') ||
      label.includes('facebook') ||
      Boolean(target.resourceAttachmentId);
    const isGoogle =
      target.externalPlatform === 'google_ads' || label.includes('google') || label.includes('search');

    if (isMeta) {
      meta += spend;
    } else if (isGoogle) {
      google += spend;
    } else {
      other += spend;
    }
  }

  return { meta, google, other, measuredCount };
}

/**
 * Builds blended cross-channel executive metrics from live Meta and Google Ads spend.
 *
 * Spend is the only figure the warehouse supplies. Revenue, conversions, churn and dunning
 * recovery have no source wired up, so they come back null rather than estimated. Previously
 * this function invented all of them: revenue was `spend * 3.6` (Meta) or `* 2.9` (Google),
 * conversions were `spend / cpc * cvr` with cpc and cvr as constants, and churn, dunning
 * recovery and conversion velocity were the literals 2.1%, 78.5% and 4.2 days scaled by a
 * hash of the project id. With no targets at all it fell back to a wholly invented baseline
 * of $8,500 Meta / $5,750 Google / 300 conversions. `periodComparison` was a lookup table
 * keyed by time window (`12.4` / `-8.5` / `15.2` for 30d) rather than any comparison.
 */
export function buildExecutiveBlendedMetrics(
  options: BuildExecutiveMetricsOptions = {},
): ExecutiveBlendedMetrics {
  const { targets = [], spendOutcome = null, overrides = {} } = options;

  const { meta, google, other, measuredCount } = sumRealSpendByPlatform(targets, spendOutcome);
  const hasSpend = measuredCount > 0;
  const totalSpendUsd = hasSpend ? meta + google + other : null;

  const measured: ExecutiveBlendedMetrics = {
    totalSpendUsd,
    metaSpendUsd: hasSpend ? meta : null,
    googleSpendUsd: hasSpend ? google : null,
    // Each of these needs a source that does not exist yet. See the type's doc comment.
    blendedCacUsd: null,
    blendedRoas: null,
    totalConversions: null,
    conversionVelocityDays: null,
    churnRatePct: null,
    dunningRecoveryRatePct: null,
  };

  // `overrides` is how a caller supplies genuinely measured figures (the report component
  // passes `externalMetrics` straight through). It is the one sanctioned way to populate the
  // null fields, and it must stay explicit rather than defaulted.
  return { ...measured, ...overrides };
}

/**
 * Builds full executive report data including channel spend breakdown.
 *
 * Per-channel ROAS, conversions and CAC are only computed when the blended figures they
 * derive from were actually supplied. They used to be manufactured from the blended ROAS by
 * multiplying it by 1.12 for Meta and 0.88 for Google — numbers with no origin at all — and
 * conversions were split by the spend ratio as though attribution followed spend.
 *
 * The rebalancing recommendation is likewise conditional. It used to be a fixed suggestion to
 * move $500/day from Google to Meta for a "$2,400 projected revenue gain", with a rationale
 * quoting ROAS figures ("3.8x vs 2.9x") that nothing had measured — offered with an Apply
 * button against a real ad account.
 */
export function buildExecutiveReportData(
  options: BuildExecutiveMetricsOptions = {},
): ExecutiveReportData {
  const metrics = buildExecutiveBlendedMetrics(options);
  const timeWindow = options.timeWindow ?? '30d';

  const channels: ChannelSpendAllocationItem[] = [];
  if (metrics.totalSpendUsd !== null && metrics.totalSpendUsd > 0) {
    const total = metrics.totalSpendUsd;
    const metaSpend = metrics.metaSpendUsd ?? 0;
    const googleSpend = metrics.googleSpendUsd ?? 0;
    const metaPct = Math.round((metaSpend / total) * 100);

    // Per-channel conversions and ROAS are NOT derived. Both were, and both were
    // assumptions dressed as measurements that happen to be invisible today only
    // because their inputs are null:
    //
    // - conversions were `totalConversions * spendShare`, which attributes
    //   conversions to a channel by how much it cost. That is not attribution; a
    //   channel can take half the budget and none of the conversions.
    // - roas was `metrics.blendedRoas` on BOTH channels, so Meta and Google would
    //   have shown the same number and neither would have been theirs.
    //
    // They would have started rendering the moment totalConversions or
    // blendedRoas got a real source - a fabrication armed rather than fixed. Spend
    // and its percentage split are real and stay.

    channels.push(
      {
        platform: 'meta_ads',
        label: 'Meta Ads',
        spendUsd: metaSpend,
        percentage: metaPct,
        roas: null,
        conversions: null,
        cacUsd: null,
        colorClass: 'bg-blue-600',
      },
      {
        platform: 'google_ads',
        label: 'Google Ads',
        spendUsd: googleSpend,
        percentage: 100 - metaPct,
        roas: null,
        conversions: null,
        cacUsd: null,
        colorClass: 'bg-emerald-600',
      },
    );
  }

  return { metrics, timeWindow, channels };
}
