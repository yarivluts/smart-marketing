import { describe, expect, it } from 'vitest';
import { synthesizeProactiveRecommendations } from './recommendation-synthesizer';
import type { UnifiedCampaignItem } from './ads-performance-synthesizer';
import type { FunnelStepItem } from './funnel-goals-synthesizer';

describe('synthesizeProactiveRecommendations', () => {
  it('generates budget scaling recommendation for high ROAS campaigns', () => {
    const campaigns: UnifiedCampaignItem[] = [
      {
        id: 'c-1',
        targetId: 't-1',
        label: 'Meta Scale Leads',
        platform: 'meta_ads',
        status: 'enabled',
        dailyBudgetUsd: 200,
        spend30dUsd: 1000,
        impressions: 50000,
        clicks: 1200,
        ctrPct: 2.4,
        cpaUsd: 12.5,
        conversions: 80,
        roas: 4.2,
      },
    ];

    const recs = synthesizeProactiveRecommendations(campaigns, []);
    expect(recs.some((r) => r.category === 'budget')).toBe(true);
    const budgetRec = recs.find((r) => r.category === 'budget');
    expect(budgetRec?.afterDiff).toBe('$250/day');
  });

  it('generates fatigue pause recommendation for low ROAS campaigns', () => {
    const campaigns: UnifiedCampaignItem[] = [
      {
        id: 'c-2',
        targetId: 't-low',
        label: 'Google Wasteful Ads',
        platform: 'google_ads',
        status: 'enabled',
        dailyBudgetUsd: 100,
        spend30dUsd: 800,
        impressions: 20000,
        clicks: 300,
        ctrPct: 1.5,
        cpaUsd: 160,
        conversions: 5,
        roas: 1.1,
      },
    ];

    const recs = synthesizeProactiveRecommendations(campaigns, []);
    expect(recs.some((r) => r.category === 'ad_fatigue')).toBe(true);
  });

  it('generates dropoff recovery recommendation for funnel steps with >50% drop-off', () => {
    const funnelSteps: FunnelStepItem[] = [
      { stepOrder: 0, stageKey: 'view', stageLabel: 'Product View', customerCount: 1000, conversionPercent: 100, dropOffPercent: 0 },
      { stepOrder: 1, stageKey: 'cart', stageLabel: 'Add to Cart', customerCount: 300, conversionPercent: 30, dropOffPercent: 70 },
    ];

    const recs = synthesizeProactiveRecommendations([], funnelSteps);
    expect(recs.some((r) => r.category === 'funnel_dropoff')).toBe(true);
  });
});
