import { describe, expect, it } from 'vitest';
import { buildUnifiedAdsCockpitData } from './ads-performance-synthesizer';
import type { AutomationTargetView } from './automation-view';

describe('ads-performance-synthesizer', () => {
  it('returns honest empty metrics for targets without warehouse data (KAN-300)', () => {
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
    // Genuine zero fallbacks, no fabricated numbers
    expect(items[0].spend30dUsd).toBe(0);
    expect(items[0].roas).toBe(0);
    expect(items[0].impressions).toBe(0);
    expect(items[0].clicks).toBe(0);
    expect(items[0].conversions).toBe(0);
    expect(items[0].ctrPct).toBe(0);
    expect(items[0].cpaUsd).toBe(0);

    expect(items[1].platform).toBe('google_ads');
    expect(items[1].status).toBe('paused');
    expect(items[1].spend30dUsd).toBe(0);

    expect(summary.totalSpendUsd).toBe(0);
    expect(summary.metaSpendUsd).toBe(0);
    expect(summary.googleSpendUsd).toBe(0);
    expect(summary.activeCampaignsCount).toBe(1);
    expect(summary.totalCampaignsCount).toBe(2);
    expect(summary.blendedRoas).toBe(0);
    expect(summary.spendChangePct).toBeUndefined();
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
    expect(items[0].impressions).toBe(0); // No hash-derived impressions
    expect(items[0].roas).toBe(0);        // No hash-derived ROAS
  });
});
