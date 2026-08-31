import { describe, expect, it } from 'vitest';
import { buildUnifiedAdsCockpitData } from './ads-performance-synthesizer';
import type { AutomationTargetView } from './automation-view';

describe('ads-performance-synthesizer', () => {
  it('synthesizes realistic deterministic performance metrics for targets without warehouse data', () => {
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
    expect(items[0].platform).toBe('meta_ads');
    expect(items[0].status).toBe('enabled');
    expect(items[0].spend30dUsd).toBeGreaterThan(0);
    expect(items[0].roas).toBeGreaterThan(0);
    expect(items[0].impressions).toBeGreaterThan(items[0].clicks);
    expect(items[0].clicks).toBeGreaterThan(items[0].conversions);

    expect(items[1].platform).toBe('google_ads');
    expect(items[1].status).toBe('paused');
    expect(items[1].spend30dUsd).toBeGreaterThan(0);

    expect(summary.totalSpendUsd).toBe(items[0].spend30dUsd + items[1].spend30dUsd);
    expect(summary.metaSpendUsd).toBe(items[0].spend30dUsd);
    expect(summary.googleSpendUsd).toBe(items[1].spend30dUsd);
    expect(summary.activeCampaignsCount).toBe(1);
    expect(summary.totalCampaignsCount).toBe(2);
    expect(summary.blendedRoas).toBeGreaterThan(0);
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
  });
});
