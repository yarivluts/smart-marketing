import { describe, expect, it } from 'vitest';
import { DEFAULT_GROWTH_SUGGESTION_THRESHOLDS, type GrowthPerformanceTotals } from '@growthos/shared';
import { budgetHoldsBack, currentDailyBudget, daysRunning, growthSuggestions, type GrowthSuggestionInput } from './suggestions';
import { liveTarget, proposalView, targetView } from './test-fixtures';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const TURNED_ON = proposalView({ id: 'on', kind: 'activate', status: 'approved', decidedOn: '2026-11-05T12:00:00.000Z' });
const totals = (extra: Partial<GrowthPerformanceTotals>): GrowthPerformanceTotals => ({ spend: 10, impressions: 0, clicks: 0, linkClicks: 0, conversions: 0, ctr: null, cpc: null, costPerConversion: null, ...extra });
const input = (extra: Partial<GrowthSuggestionInput>): GrowthSuggestionInput => ({ target: liveTarget(), proposals: [TURNED_ON], changeAreas: ['ads', 'landing'], videoAvailable: false, results: null, now: NOW, ...extra });
const ids = (extra: Partial<GrowthSuggestionInput>) => growthSuggestions(input(extra)).map((suggestion) => suggestion.id);

describe('growthSuggestions', () => {
  it('suggests new ads when they were seen for days and nobody clicked', () => {
    expect(growthSuggestions(input({ results: totals({ impressions: 800 }) }))).toEqual([{ id: 'no_clicks', action: 'change', area: 'ads' }]);
  });

  it('waits before judging: too few days, or too few people saw them', () => {
    expect(ids({ results: totals({ impressions: 800 }), proposals: [{ ...TURNED_ON, decidedOn: '2026-11-09T12:00:00.000Z' }] })).toEqual([]);
    expect(ids({ results: totals({ impressions: 100 }) })).toEqual([]);
  });

  it('suggests a clearer ad when many saw it and almost nobody clicked', () => {
    expect(ids({ results: totals({ impressions: 5000, clicks: 10, ctr: 0.002 }) })).toEqual(['low_ctr']);
    expect(ids({ results: totals({ impressions: 5000, clicks: 100, ctr: 0.02, conversions: 3 }) })).toEqual([]);
  });

  it('suggests a clearer page when people click but nobody acts', () => {
    expect(growthSuggestions(input({ results: totals({ impressions: 5000, clicks: 40, ctr: 0.008 }) }))).toEqual([{ id: 'no_conversions', action: 'change', area: 'landing' }]);
    expect(ids({ results: totals({ impressions: 5000, clicks: 40, ctr: 0.008, conversions: 2 }) })).toEqual([]);
  });

  it('offers a video only when one can be made and there is none, or the last one failed', () => {
    const target = targetView({ adsStatus: 'approved' });
    expect(growthSuggestions(input({ target, videoAvailable: true }))).toEqual([{ id: 'add_video', action: 'video' }]);
    expect(ids({ target: { ...target, videoStatus: 'failed' }, videoAvailable: true })).toEqual(['retry_video']);
    expect(ids({ target: { ...target, videoStatus: 'ready' }, videoAvailable: true })).toEqual([]);
    expect(ids({ target, videoAvailable: false })).toEqual([]);
    expect(ids({ target: { ...target, adsStatus: 'building' }, videoAvailable: true })).toEqual([]);
  });

  it('offers another try for a failed or declined part, only when it can be redone', () => {
    const target = targetView({ adsStatus: 'failed', landingStatus: 'rejected', audienceStatus: 'failed' });
    expect(ids({ target, changeAreas: ['ads', 'landing', 'audience'] })).toEqual(['ads_failed', 'landing_declined', 'audience_failed']);
    expect(ids({ target: { ...target, adsStatus: 'rejected', landingStatus: 'failed' }, changeAreas: ['ads', 'landing'] })).toEqual(['ads_declined', 'landing_failed']);
    expect(ids({ target, changeAreas: [] })).toEqual([]);
  });

  it('suggests nothing for a target that is not being promoted, or ads that cannot be redone', () => {
    expect(ids({ target: liveTarget({ status: 'proposed' }), results: totals({ impressions: 800 }) })).toEqual([]);
    expect(ids({ changeAreas: [], results: totals({ impressions: 800 }) })).toEqual([]);
  });
});

describe('growthSuggestions with the project thresholds', () => {
  it('judges by the thresholds it is given, not the built-in ones', () => {
    // 2 days on and 400 impressions: too early by default, a signal when the project says 2 days and 300 impressions are enough.
    const early = { results: totals({ impressions: 400 }), proposals: [{ ...TURNED_ON, decidedOn: '2026-11-08T12:00:00.000Z' }] };
    expect(ids(early)).toEqual([]);
    expect(ids({ ...early, thresholds: { ...DEFAULT_GROWTH_SUGGESTION_THRESHOLDS, noClicksAfterDays: 2 } })).toEqual(['no_clicks']);
    expect(ids({ ...early, thresholds: { ...DEFAULT_GROWTH_SUGGESTION_THRESHOLDS, noClicksAfterDays: 2, noClicksMinImpressions: 500 } })).toEqual([]);
    // 1% click-through is fine by default (0.5%), low for a project that wants 2%.
    const ok = { results: totals({ impressions: 5000, clicks: 50, ctr: 0.01, conversions: 1 }) };
    expect(ids(ok)).toEqual([]);
    expect(ids({ ...ok, thresholds: { ...DEFAULT_GROWTH_SUGGESTION_THRESHOLDS, lowCtr: 0.02 } })).toEqual(['low_ctr']);
    expect(ids({ ...ok, thresholds: { ...DEFAULT_GROWTH_SUGGESTION_THRESHOLDS, lowCtr: 0.02, lowCtrMinImpressions: 10_000 } })).toEqual([]);
    // 20 clicks and no conversion: a page problem for a project that says 20 is enough, not by default (30).
    const clicks = { results: totals({ impressions: 1000, clicks: 20, ctr: 0.02 }) };
    expect(ids(clicks)).toEqual([]);
    expect(ids({ ...clicks, thresholds: { ...DEFAULT_GROWTH_SUGGESTION_THRESHOLDS, noConversionsMinClicks: 20 } })).toEqual(['no_conversions']);
  });
});

describe('raise the budget', () => {
  // 5 days on at 20 a day: 95 spent is 95% of what the budget allows, with a 2% click-through and 4 conversions.
  const good = totals({ spend: 95, impressions: 5000, clicks: 100, ctr: 0.02, conversions: 4 });
  const budget = (extra: Partial<GrowthSuggestionInput> = {}) => ids({ results: good, canChangeBudget: true, dailyBudget: 20, ...extra });

  it('suggests more budget when results are good and the budget is what holds them back', () => {
    expect(growthSuggestions(input({ results: good, canChangeBudget: true, dailyBudget: 20 }))).toEqual([{ id: 'raise_budget', action: 'budget' }]);
  });

  it('does not when the budget is not spent, results are weak, it is too early, or the person cannot change it', () => {
    expect(budget({ results: { ...good, spend: 40 } })).toEqual([]);
    expect(budget({ results: { ...good, ctr: 0.01 } })).toEqual([]);
    expect(budget({ results: { ...good, conversions: 1 } })).toEqual([]);
    expect(budget({ proposals: [{ ...TURNED_ON, decidedOn: '2026-11-09T12:00:00.000Z' }], results: { ...good, spend: 20 } })).toEqual([]);
    expect(budget({ canChangeBudget: false })).toEqual([]);
    expect(budget({ dailyBudget: null })).toEqual([]);
    expect(budget({ target: liveTarget({ publishStatus: 'published' }) })).toEqual([]);
  });

  it('reads its own thresholds', () => {
    expect(budget({ thresholds: { ...DEFAULT_GROWTH_SUGGESTION_THRESHOLDS, raiseBudgetSpendShare: 0.99 } })).toEqual([]);
    expect(budget({ results: { ...good, conversions: 1 }, thresholds: { ...DEFAULT_GROWTH_SUGGESTION_THRESHOLDS, raiseBudgetMinConversions: 1 } })).toEqual(['raise_budget']);
    expect(budget({ thresholds: { ...DEFAULT_GROWTH_SUGGESTION_THRESHOLDS, raiseBudgetMinCtr: 0.05 } })).toEqual([]);
    expect(budget({ thresholds: { ...DEFAULT_GROWTH_SUGGESTION_THRESHOLDS, raiseBudgetAfterDays: 10 } })).toEqual([]);
  });

  it('averages spend over at most the window the numbers cover', () => {
    expect(budgetHoldsBack(totals({ spend: 30 * 19, ctr: 0.02, conversions: 5 }), 90, 20, DEFAULT_GROWTH_SUGGESTION_THRESHOLDS)).toBe(true);
    expect(budgetHoldsBack(totals({ spend: 30 * 10, ctr: 0.02, conversions: 5 }), 90, 20, DEFAULT_GROWTH_SUGGESTION_THRESHOLDS)).toBe(false);
  });
});

describe('currentDailyBudget', () => {
  it('reads the budget kept on the target, else the one approved at publishing', () => {
    const published = proposalView({ id: 'pub', kind: 'publish', status: 'approved', publish: { destination: 'meta', imageIds: [], dailyBudget: 25, linkUrl: 'https://a.co', campaignName: 'C', countries: ['IL'] } });
    expect(currentDailyBudget(liveTarget({ dailyBudget: 40 }), [published])).toBe(40);
    expect(currentDailyBudget(liveTarget(), [published])).toBe(25);
    expect(currentDailyBudget(liveTarget(), [])).toBeNull();
  });
});

describe('daysRunning', () => {
  it('counts whole days since the ads were turned on, and nothing when they are not on', () => {
    expect(daysRunning(liveTarget(), [TURNED_ON], NOW)).toBe(5);
    expect(daysRunning(liveTarget({ publishStatus: 'published' }), [TURNED_ON], NOW)).toBeNull();
    expect(daysRunning(liveTarget(), [], NOW)).toBeNull();
  });
});
