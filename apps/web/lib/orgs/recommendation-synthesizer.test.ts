import { describe, expect, it } from 'vitest';
import { synthesizeProactiveRecommendations } from './recommendation-synthesizer';
import { enMessagesFor, heMessagesFor, t, translatorFor } from './recommendation-test-translator';
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

    const recs = synthesizeProactiveRecommendations(t, campaigns, []);
    expect(recs.some((r) => r.category === 'budget')).toBe(true);
    const budgetRec = recs.find((r) => r.category === 'budget');
    expect(budgetRec?.afterDiff).toBe('$250 a day');
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

    const recs = synthesizeProactiveRecommendations(t, campaigns, []);
    expect(recs.some((r) => r.category === 'ad_fatigue')).toBe(true);
  });

  it('generates dropoff recovery recommendation for funnel steps with >50% drop-off', () => {
    const funnelSteps: FunnelStepItem[] = [
      { stepOrder: 0, stageKey: 'view', stageLabel: 'Product View', customerCount: 1000, conversionPercent: 100, dropOffPercent: 0 },
      { stepOrder: 1, stageKey: 'cart', stageLabel: 'Add to Cart', customerCount: 300, conversionPercent: 30, dropOffPercent: 70 },
    ];

    const recs = synthesizeProactiveRecommendations(t, [], funnelSteps);
    expect(recs.some((r) => r.category === 'funnel_dropoff')).toBe(true);
  });
});

/**
 * The guard these cases protect only works if callers pass honest input. The automation page
 * used to hand this function a literal `roas: 3.8` for every campaign, which is never null, so
 * the high-ROAS branch fired for every campaign on every project - with an Apply button wired
 * to a real ad account. The same constant sat permanently above 3.5 and below nothing, so the
 * pause branch could never fire either.
 */
describe('synthesizeProactiveRecommendations - unmeasured campaigns', () => {
  const unmeasured = {
    id: 'c1',
    targetId: 'tgt-1',
    label: 'EasySign Brand',
    platform: 'meta_ads' as const,
    status: 'enabled' as const,
    dailyBudgetUsd: 120,
    spend30dUsd: null,
    impressions: null,
    clicks: null,
    ctrPct: null,
    cpaUsd: null,
    conversions: null,
    roas: null,
  };

  it('raises no campaign recommendation when nothing has been measured', () => {
    expect(synthesizeProactiveRecommendations(t, [unmeasured], [])).toEqual([]);
  });

  it('raises a funnel recommendation from a real drop-off, with no invented forecast', () => {
    const recs = synthesizeProactiveRecommendations(
      t,
      [unmeasured],
      [
        { stageKey: 'view', stageLabel: 'Product View', stepOrder: 0, customerCount: 1000, conversionPercent: 100, dropOffPercent: 0 },
        { stageKey: 'checkout', stageLabel: 'Checkout', stepOrder: 1, customerCount: 300, conversionPercent: 30, dropOffPercent: 70 },
      ],
    );

    expect(recs).toHaveLength(1);
    expect(recs[0].category).toBe('funnel_dropoff');
    // The 70% is measured; the old "+35 rescued conversions / month" was not.
    expect(recs[0].description).toContain('70%');
    expect(recs[0].projectedImpact).toBe('');
    expect(recs[0].actionProposal.estimatedImpact).toBe('');
  });

  it('still acts on a campaign once its ROAS is genuinely measured', () => {
    const recs = synthesizeProactiveRecommendations(t, [{ ...unmeasured, roas: 4.2 }], []);
    expect(recs).toHaveLength(1);
    expect(recs[0].category).toBe('budget');
    expect(recs[0].actionProposal.targetId).toBe('tgt-1');
  });
});

describe('synthesizeProactiveRecommendations - plain words in both languages', () => {
  const funnel = [
    { stageKey: 'view', stageLabel: 'Product View', stepOrder: 0, customerCount: 1000, conversionPercent: 100, dropOffPercent: 0 },
    { stageKey: 'cart', stageLabel: 'Cart', stepOrder: 1, customerCount: 300, conversionPercent: 30, dropOffPercent: 70 },
  ];
  const measured = (roas: number, spend30dUsd: number) => ({
    id: 'c', targetId: 'tgt', label: 'Brand', platform: 'meta_ads' as const, status: 'enabled' as const,
    dailyBudgetUsd: 100, spend30dUsd, impressions: null, clicks: null, ctrPct: null, cpaUsd: null, conversions: null, roas,
  });
  const jargon = /ROAS|retarget|drop-off|conversion/i;

  function texts(translate: ReturnType<typeof translatorFor>): string[] {
    return [...synthesizeProactiveRecommendations(translate, [measured(4.2, 0)], funnel), ...synthesizeProactiveRecommendations(translate, [measured(1.1, 800)], [])]
      .flatMap((r) => [r.title, r.description, r.beforeDiff, r.afterDiff, r.projectedImpact, r.actionProposal.beforeValue, r.actionProposal.afterValue, r.actionProposal.estimatedImpact].map(String));
  }

  it('explains the funnel recommendation in everyday English with the measured percentage', () => {
    const [rec] = synthesizeProactiveRecommendations(t, [], funnel);
    expect(rec.description).toContain('70% of the people who reach "Cart" leave before the next step');
    expect(rec.title).toBe('Win back people who leave at "Cart"');
    expect(rec.actionProposal.afterValue).toBe('Draft ad, $150 a day');
  });

  it('uses no marketing jargon in English', () => {
    for (const text of texts(t)) expect(text).not.toMatch(jargon);
  });

  it('has every message in Hebrew, with no English words left and no unfilled placeholders', () => {
    const he = translatorFor(heMessagesFor);
    expect(Object.keys(heMessagesFor).sort()).toEqual(Object.keys(enMessagesFor).sort());
    for (const text of texts(he)) {
      expect(text).not.toMatch(/\{\w+\}/);
      expect(text.replace(/Brand|Cart|Product View/g, '')).not.toMatch(/[A-Za-z]{3,}/);
    }
  });
});
