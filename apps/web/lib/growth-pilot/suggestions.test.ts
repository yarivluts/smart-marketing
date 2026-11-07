import { describe, expect, it } from 'vitest';
import type { GrowthPerformanceTotals } from '@growthos/shared';
import { daysRunning, growthSuggestions, type GrowthSuggestionInput } from './suggestions';
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

describe('daysRunning', () => {
  it('counts whole days since the ads were turned on, and nothing when they are not on', () => {
    expect(daysRunning(liveTarget(), [TURNED_ON], NOW)).toBe(5);
    expect(daysRunning(liveTarget({ publishStatus: 'published' }), [TURNED_ON], NOW)).toBeNull();
    expect(daysRunning(liveTarget(), [], NOW)).toBeNull();
  });
});
