import { describe, expect, it } from 'vitest';
import { buildUnifiedAdsCockpitData } from './ads-performance-synthesizer';
import type { AutomationTargetView } from './automation-view';

describe('ads-performance-synthesizer', () => {
  /**
   * This suite previously asserted the opposite: that targets with no warehouse data still
   * came back with spend, ROAS, impressions, clicks and conversions, all "realistic" and
   * deterministic. They were arithmetic on the daily budget — spend was budget * 30 * 0.88,
   * clicks were spend / an invented CPC, impressions were clicks * 24 or * 45 — and the
   * cockpit rendered them as measurements. The tests pinned the fabrication in place.
   */
  it('reports null metrics for targets the warehouse has no data for', () => {
    const targets: AutomationTargetView[] = [
      {
        id: 'campaign-1',
        targetType: 'campaign',
        label: 'Meta Scale Leads',
        dailyBudgetUsd: 100,
        environmentId: 'live',
        externalPlatform: 'meta_ads',
        campaignStatus: 'enabled',
      },
      {
        id: 'campaign-2',
        targetType: 'campaign',
        label: 'Google Search Conversions',
        dailyBudgetUsd: 150,
        environmentId: 'live',
        externalPlatform: 'google_ads',
        campaignStatus: 'paused',
      },
    ];

    const { items, summary } = buildUnifiedAdsCockpitData(targets, null);

    expect(items).toHaveLength(2);

    // The facts about a campaign that come from the target row itself stay real.
    expect(items[0].platform).toBe('meta_ads');
    expect(items[0].status).toBe('enabled');
    expect(items[0].dailyBudgetUsd).toBe(100);
    expect(items[1].platform).toBe('google_ads');
    expect(items[1].status).toBe('paused');

    // Everything that would have to be measured is absent, not estimated.
    for (const item of items) {
      expect(item.spend30dUsd).toBeNull();
      expect(item.roas).toBeNull();
      expect(item.impressions).toBeNull();
      expect(item.clicks).toBeNull();
      expect(item.ctrPct).toBeNull();
      expect(item.cpaUsd).toBeNull();
      expect(item.conversions).toBeNull();
    }

    expect(summary.totalSpendUsd).toBeNull();
    expect(summary.metaSpendUsd).toBeNull();
    expect(summary.googleSpendUsd).toBeNull();
    expect(summary.blendedRoas).toBeNull();
    expect(summary.blendedCtrPct).toBeNull();
    expect(summary.blendedCpaUsd).toBeNull();
    expect(summary.campaignsWithSpendCount).toBe(0);

    // Counts come from the target list, so they are real even with no measurements.
    expect(summary.activeCampaignsCount).toBe(1);
    expect(summary.totalCampaignsCount).toBe(2);
  });

  it('uses live warehouse spend breakdown when available', () => {
    const targets: AutomationTargetView[] = [
      {
        id: 'c1',
        targetType: 'campaign',
        label: 'Real Campaign',
        dailyBudgetUsd: 50,
        environmentId: 'live',
        campaignResourceName: 'customers/123/campaigns/c1',
        campaignStatus: 'enabled',
      },
    ];

    const spendOutcome = {
      ok: true as const,
      rows: [
        {
          campaignId: 'customers/123/campaigns/c1',
          campaignName: 'Real Campaign',
          platform: 'google_ads' as const,
          monthlyBudget: 1500,
          actualSpend: 1450,
          targetSpend: 1500,
          budgetCompliancePct: 96.6,
          status: 'on_target' as const,
        },
      ],
    };

    const { items, summary } = buildUnifiedAdsCockpitData(targets, spendOutcome);

    expect(items[0].spend30dUsd).toBe(1450);
    expect(summary.totalSpendUsd).toBe(1450);
    expect(summary.campaignsWithSpendCount).toBe(1);

    // Real spend does not license inventing the metrics that depend on it: ROAS needs
    // attributed revenue and CPA needs conversions, and neither has a source.
    expect(items[0].roas).toBeNull();
    expect(items[0].cpaUsd).toBeNull();
    expect(summary.blendedRoas).toBeNull();
  });

  it('keeps a measured zero as zero rather than collapsing it to "no data"', () => {
    const targets: AutomationTargetView[] = [
      {
        id: 'c-zero',
        targetType: 'campaign',
        label: 'Paused All Month',
        dailyBudgetUsd: 40,
        environmentId: 'live',
        campaignResourceName: 'customers/123/campaigns/c-zero',
        campaignStatus: 'paused',
      },
    ];

    const { items, summary } = buildUnifiedAdsCockpitData(targets, {
      ok: true as const,
      rows: [
        {
          campaignId: 'customers/123/campaigns/c-zero',
          monthlyBudget: 1200,
          actualSpend: 0,
          status: 'on_target' as const,
        },
      ],
    });

    expect(items[0].spend30dUsd).toBe(0);
    expect(summary.totalSpendUsd).toBe(0);
    expect(summary.campaignsWithSpendCount).toBe(1);
  });
});
