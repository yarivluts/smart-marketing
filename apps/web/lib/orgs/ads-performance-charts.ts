import type { UnifiedCampaignItem } from './ads-performance-synthesizer';

export type AdsPlatform = UnifiedCampaignItem['platform'];

/** Display order for channels - the ad platforms first, the unconnected bucket last. */
export const ADS_PLATFORM_ORDER: readonly AdsPlatform[] = ['meta_ads', 'google_ads', 'simulated'];

/** One channel's slice of the cockpit, computed only from the campaign rows and their measured spend. */
export interface AdsChannelBreakdown {
  platform: AdsPlatform;
  campaigns: number;
  activeCampaigns: number;
  /** Configured daily budget of the channel's active campaigns. */
  activeDailyBudgetUsd: number;
  /** Configured daily budget of the channel's paused (or not-yet-live) campaigns. */
  inactiveDailyBudgetUsd: number;
  /** Sum of measured spend; null when no campaign in the channel has a measurement. */
  spendUsd: number | null;
  measuredCampaigns: number;
}

/**
 * Groups campaigns by channel. Only channels that have at least one campaign are returned, in
 * {@link ADS_PLATFORM_ORDER}. Spend stays null for a channel with no measured campaign, so a
 * channel nobody has data for never reads as a channel that spent nothing.
 */
export function buildAdsChannelBreakdown(items: readonly UnifiedCampaignItem[]): AdsChannelBreakdown[] {
  const byPlatform = new Map<AdsPlatform, AdsChannelBreakdown>();
  for (const item of items) {
    const channel = byPlatform.get(item.platform) ?? {
      platform: item.platform,
      campaigns: 0,
      activeCampaigns: 0,
      activeDailyBudgetUsd: 0,
      inactiveDailyBudgetUsd: 0,
      spendUsd: null,
      measuredCampaigns: 0,
    };
    channel.campaigns += 1;
    const budget = Number.isFinite(item.dailyBudgetUsd) ? item.dailyBudgetUsd : 0;
    if (item.status === 'enabled') {
      channel.activeCampaigns += 1;
      channel.activeDailyBudgetUsd += budget;
    } else {
      channel.inactiveDailyBudgetUsd += budget;
    }
    if (item.spend30dUsd !== null) {
      channel.measuredCampaigns += 1;
      channel.spendUsd = (channel.spendUsd ?? 0) + item.spend30dUsd;
    }
    byPlatform.set(item.platform, channel);
  }
  return ADS_PLATFORM_ORDER.flatMap((platform) => {
    const channel = byPlatform.get(platform);
    return channel ? [channel] : [];
  });
}

/** Campaigns with a measured, non-zero spend, largest first - the rows of the "spend by campaign" chart. */
export function spendByCampaign(items: readonly UnifiedCampaignItem[]): { targetId: string; label: string; platform: AdsPlatform; spendUsd: number }[] {
  return items
    .filter((item): item is UnifiedCampaignItem & { spend30dUsd: number } => item.spend30dUsd !== null && item.spend30dUsd > 0)
    .map((item) => ({ targetId: item.targetId, label: item.label, platform: item.platform, spendUsd: item.spend30dUsd }))
    .sort((a, b) => b.spendUsd - a.spendUsd);
}

export interface AdsEfficiency {
  /** Measured spend over the window, divided by the window's days. */
  avgDailySpendUsd: number;
  /**
   * Measured spend as a percentage of what the same campaigns' configured daily budgets allow over
   * the window. Null when those campaigns carry no budget (nothing to divide by).
   */
  budgetUtilizationPct: number | null;
  /** Share of campaigns that have a spend measurement at all, as a percentage. */
  measuredCoveragePct: number;
  totalSpendUsd: number;
}

/**
 * Efficiency figures derived only from measured spend and the campaigns' own configured budgets.
 * Null when no campaign has a spend measurement - there is nothing to derive from.
 */
export function buildAdsEfficiency(items: readonly UnifiedCampaignItem[], windowDays: number): AdsEfficiency | null {
  const measured = items.filter((item): item is UnifiedCampaignItem & { spend30dUsd: number } => item.spend30dUsd !== null);
  if (measured.length === 0 || windowDays <= 0) {
    return null;
  }
  const totalSpendUsd = measured.reduce((sum, item) => sum + item.spend30dUsd, 0);
  const budgetCapacity = measured.reduce((sum, item) => sum + (Number.isFinite(item.dailyBudgetUsd) ? item.dailyBudgetUsd : 0), 0) * windowDays;
  return {
    totalSpendUsd,
    avgDailySpendUsd: totalSpendUsd / windowDays,
    budgetUtilizationPct: budgetCapacity > 0 ? Math.round((totalSpendUsd / budgetCapacity) * 1000) / 10 : null,
    measuredCoveragePct: Math.round((measured.length / items.length) * 100),
  };
}

/** Sum of the configured daily budgets of every active campaign. */
export function liveDailyBudgetUsd(items: readonly UnifiedCampaignItem[]): number {
  return items.reduce((sum, item) => (item.status === 'enabled' && Number.isFinite(item.dailyBudgetUsd) ? sum + item.dailyBudgetUsd : sum), 0);
}
