import { describe, expect, it } from 'vitest';
import type { UnifiedCampaignItem } from './ads-performance-synthesizer';
import { buildAdsChannelBreakdown, buildAdsEfficiency, liveDailyBudgetUsd, spendByCampaign } from './ads-performance-charts';

function campaign(overrides: Partial<UnifiedCampaignItem> & Pick<UnifiedCampaignItem, 'id'>): UnifiedCampaignItem {
  return {
    targetId: overrides.id,
    label: overrides.id,
    platform: 'meta_ads',
    status: 'enabled',
    dailyBudgetUsd: 10,
    spend30dUsd: null,
    roas: null,
    impressions: null,
    clicks: null,
    ctrPct: null,
    cpaUsd: null,
    conversions: null,
    ...overrides,
  };
}

describe('buildAdsChannelBreakdown', () => {
  it('groups campaigns per channel in display order, splitting budget by status', () => {
    const channels = buildAdsChannelBreakdown([
      campaign({ id: 'g1', platform: 'google_ads', status: 'paused', dailyBudgetUsd: 20 }),
      campaign({ id: 'm1', platform: 'meta_ads', status: 'enabled', dailyBudgetUsd: 50 }),
      campaign({ id: 'm2', platform: 'meta_ads', status: 'paused', dailyBudgetUsd: 1 }),
    ]);
    expect(channels.map((channel) => channel.platform)).toEqual(['meta_ads', 'google_ads']);
    expect(channels[0]).toMatchObject({ campaigns: 2, activeCampaigns: 1, activeDailyBudgetUsd: 50, inactiveDailyBudgetUsd: 1 });
    expect(channels[1]).toMatchObject({ campaigns: 1, activeCampaigns: 0, activeDailyBudgetUsd: 0, inactiveDailyBudgetUsd: 20 });
  });

  it('keeps spend null for a channel nobody measured, and a measured zero as zero', () => {
    const channels = buildAdsChannelBreakdown([
      campaign({ id: 'm1', platform: 'meta_ads', spend30dUsd: null }),
      campaign({ id: 'g1', platform: 'google_ads', spend30dUsd: 0 }),
    ]);
    expect(channels.find((channel) => channel.platform === 'meta_ads')?.spendUsd).toBeNull();
    expect(channels.find((channel) => channel.platform === 'google_ads')?.spendUsd).toBe(0);
  });
});

describe('spendByCampaign', () => {
  it('lists only campaigns with measured positive spend, largest first', () => {
    const rows = spendByCampaign([
      campaign({ id: 'a', spend30dUsd: 10 }),
      campaign({ id: 'b', spend30dUsd: null }),
      campaign({ id: 'c', spend30dUsd: 0 }),
      campaign({ id: 'd', spend30dUsd: 90 }),
    ]);
    expect(rows.map((row) => [row.targetId, row.spendUsd])).toEqual([
      ['d', 90],
      ['a', 10],
    ]);
  });
});

describe('buildAdsEfficiency', () => {
  it('is null when no campaign has a spend measurement', () => {
    expect(buildAdsEfficiency([campaign({ id: 'a' })], 30)).toBeNull();
  });

  it('derives utilization and coverage from measured campaigns only', () => {
    const efficiency = buildAdsEfficiency(
      [
        campaign({ id: 'a', dailyBudgetUsd: 10, spend30dUsd: 150 }),
        campaign({ id: 'b', dailyBudgetUsd: 10, spend30dUsd: 150 }),
        // Unmeasured: its budget must not dilute the utilization.
        campaign({ id: 'c', dailyBudgetUsd: 1000, spend30dUsd: null }),
      ],
      30,
    );
    expect(efficiency).toEqual({ totalSpendUsd: 300, avgDailySpendUsd: 10, budgetUtilizationPct: 50, measuredCoveragePct: 67 });
  });

  it('reports no utilization when the measured campaigns carry no budget', () => {
    expect(buildAdsEfficiency([campaign({ id: 'a', dailyBudgetUsd: 0, spend30dUsd: 5 })], 30)?.budgetUtilizationPct).toBeNull();
  });
});

describe('liveDailyBudgetUsd', () => {
  it('sums only active campaigns', () => {
    expect(liveDailyBudgetUsd([campaign({ id: 'a', dailyBudgetUsd: 50 }), campaign({ id: 'b', status: 'paused', dailyBudgetUsd: 20 })])).toBe(50);
  });
});
