import { describe, expect, it } from 'vitest';
import type { GrowthPerformanceTotals } from '@growthos/shared';
import { growthNextDecision, growthPilotOverview, growthTargetProgress, mergeActivity, targetActivity, targetChangeAreas, type GrowthStageId, type GrowthStageState } from './progress';
import { liveTarget, pageData, proposalView, targetView } from './test-fixtures';
import type { GrowthActivityView } from './view';

const states = (progress: ReturnType<typeof growthTargetProgress>) => Object.fromEntries(progress.stages.map((stage) => [stage.id, stage.state])) as Record<GrowthStageId, GrowthStageState>;
const RESULTS: GrowthPerformanceTotals = { spend: 12, impressions: 900, clicks: 14, linkClicks: 10, conversions: 1, ctr: 0.015, cpc: 0.85, costPerConversion: 12 };

describe('growthTargetProgress', () => {
  it('counts a fully live target with results as done, leaving out the video it never had', () => {
    const progress = growthTargetProgress({ target: liveTarget(), proposals: [], landingPages: [], pilotActive: true, results: RESULTS });
    expect(states(progress)).toEqual({ idea: 'done', audience: 'done', landing: 'done', images: 'done', video: 'skipped', published: 'done', live: 'done', results: 'done' });
    expect(progress).toMatchObject({ done: 7, applicable: 7, percent: 100 });
  });

  it('is collecting results while the ads run before Meta reports any', () => {
    const progress = growthTargetProgress({ target: liveTarget(), proposals: [], landingPages: [], pilotActive: true, results: null });
    expect(states(progress).results).toBe('in_progress');
    expect(progress.percent).toBe(86);
  });

  it('a newly approved target: the pilot is writing its page and opening its ads; the audience waits for the ads', () => {
    const progress = growthTargetProgress({ target: targetView({ briefId: null }), proposals: [], landingPages: [], pilotActive: true });
    expect(states(progress)).toMatchObject({ idea: 'done', audience: 'not_started', landing: 'in_progress', images: 'in_progress', video: 'skipped', published: 'not_started' });
    expect(progress).toMatchObject({ done: 1, applicable: 7, percent: 14 });
  });

  it('nothing is in progress while the pilot is paused', () => {
    const progress = growthTargetProgress({ target: targetView(), proposals: [], landingPages: [], pilotActive: false });
    expect(progress.stages.some((stage) => stage.state === 'in_progress')).toBe(false);
  });

  it('marks what waits for the person with the proposal to decide, and a revision on request as in progress', () => {
    const proposals = [proposalView({ id: 'ads1', kind: 'ads', status: 'pending' }), proposalView({ id: 'lp', kind: 'landing_page', status: 'revising' }), proposalView({ id: 'aud', kind: 'audience', status: 'pending' })];
    const progress = growthTargetProgress({ target: targetView({ adsStatus: 'ready', landingStatus: 'ready', audienceStatus: 'ready' }), proposals, landingPages: [], pilotActive: true });
    expect(progress.stages.find((stage) => stage.id === 'images')).toMatchObject({ state: 'waiting', proposalId: 'ads1' });
    expect(progress.stages.find((stage) => stage.id === 'landing')).toMatchObject({ state: 'in_progress', proposalId: 'lp' });
    expect(progress.stages.find((stage) => stage.id === 'audience')).toMatchObject({ state: 'waiting', proposalId: 'aud' });
  });

  it('keeps failures in the count (with their reason) and leaves declined optional parts out of it', () => {
    const failed = growthTargetProgress({ target: targetView({ adsStatus: 'failed', adsFailure: 'quota_exceeded', landingStatus: 'failed', landingFailure: 'invalid_output' }), proposals: [], landingPages: [], pilotActive: true });
    expect(failed.stages.find((stage) => stage.id === 'images')).toMatchObject({ state: 'failed', failure: 'quota_exceeded' });
    expect(failed.applicable).toBe(7);

    // A declined page or audience means the ads go to the site / the default audience: not applicable.
    const declined = growthTargetProgress({ target: targetView({ landingStatus: 'rejected', audienceStatus: 'rejected', adsStatus: 'approved' }), proposals: [], landingPages: [], pilotActive: true });
    expect(states(declined)).toMatchObject({ landing: 'skipped', audience: 'skipped' });
    expect(declined).toMatchObject({ done: 2, applicable: 5, percent: 40 });
  });

  it('counts declined images, publishing and turning on as not done', () => {
    const progress = growthTargetProgress({ target: targetView({ adsStatus: 'rejected' }), proposals: [], landingPages: [], pilotActive: true });
    expect(states(progress).images).toBe('declined');
    const published = growthTargetProgress({ target: liveTarget({ publishStatus: 'published' }), proposals: [], landingPages: [], pilotActive: true });
    expect(states(published)).toMatchObject({ published: 'done', live: 'declined', results: 'not_started' });
    const turnOn = growthTargetProgress({ target: liveTarget({ publishStatus: 'published' }), proposals: [proposalView({ id: 'act', kind: 'activate' })], landingPages: [], pilotActive: true });
    expect(turnOn.stages.find((stage) => stage.id === 'live')).toMatchObject({ state: 'waiting', proposalId: 'act' });
  });

  it('waits for a Meta ad account, and keeps a failed publish open for another try', () => {
    expect(states(growthTargetProgress({ target: liveTarget({ publishStatus: 'needs_meta' }), proposals: [], landingPages: [], pilotActive: true })).published).toBe('waiting');
    const failed = growthTargetProgress({ target: liveTarget({ publishStatus: 'failed', publishFailure: 'auth_failed' }), proposals: [proposalView({ id: 'pub', kind: 'publish' })], landingPages: [], pilotActive: true });
    expect(failed.stages.find((stage) => stage.id === 'published')).toMatchObject({ state: 'failed', failure: 'auth_failed', proposalId: 'pub' });
  });

  it('counts the video once one is being made', () => {
    const making = growthTargetProgress({ target: liveTarget({ videoStatus: 'building' }), proposals: [], landingPages: [], pilotActive: true, results: RESULTS });
    expect(making).toMatchObject({ done: 7, applicable: 8, percent: 88 });
    expect(states(growthTargetProgress({ target: liveTarget({ videoStatus: 'ready' }), proposals: [], landingPages: [], pilotActive: true, results: RESULTS }))).toMatchObject({ video: 'done' });
  });

  it('dates each done stage by its decision, and the page by when it went public', () => {
    const proposals = [
      proposalView({ kind: 'target', status: 'approved', decidedOn: '2026-11-01T11:00:00.000Z' }),
      proposalView({ id: 'a1', kind: 'ads', status: 'approved', decidedOn: '2026-11-02T11:00:00.000Z' }),
      proposalView({ id: 'a2', kind: 'ads', status: 'approved', decidedOn: '2026-11-04T11:00:00.000Z' }),
    ];
    const landingPages = [{ id: 'lp1', targetId: 't1', slug: 'abc', status: 'published' as const, content: {} as never, dir: 'ltr' as const, ctaUrl: '', publishedOn: '2026-11-03T11:00:00.000Z' }];
    const progress = growthTargetProgress({ target: liveTarget(), proposals, landingPages, pilotActive: true });
    const on = Object.fromEntries(progress.stages.map((stage) => [stage.id, stage.on]));
    expect(on).toMatchObject({ idea: '2026-11-01T11:00:00.000Z', images: '2026-11-04T11:00:00.000Z', landing: '2026-11-03T11:00:00.000Z' });
  });

  it('a target still waiting for approval: only the idea waits, the rest has not started', () => {
    const progress = growthTargetProgress({ target: targetView({ status: 'proposed' }), proposals: [proposalView({ id: 'idea' })], landingPages: [], pilotActive: true });
    expect(progress.stages[0]).toMatchObject({ id: 'idea', state: 'waiting', proposalId: 'idea' });
    expect(progress.stages.slice(1).every((stage) => stage.state === 'not_started' || stage.state === 'skipped')).toBe(true);
    expect(progress.percent).toBe(0);
  });
});

describe('the whole pilot', () => {
  it('sums every promoted target, and counts the decisions waiting', () => {
    const data = pageData({
      targets: [liveTarget(), targetView({ id: 't2', name: 'Law firms', publishStatus: 'needs_meta', adsStatus: 'approved', landingStatus: 'published', audienceStatus: 'approved' }), targetView({ id: 't3', status: 'proposed' })],
      proposals: [proposalView({ id: 'idea3', targetId: 't3' })],
    });
    const overview = growthPilotOverview(data, { t1: RESULTS });
    expect(overview).toMatchObject({ targets: 2, waiting: 2, done: 11, inProgress: 0 });
    expect(overview.percent).toBe(Math.round((11 / 14) * 100));
  });

  it('picks the decision closest to the ads reaching people, then a Meta account to connect', () => {
    const proposals = [proposalView({ id: 'idea', kind: 'target' }), proposalView({ id: 'ads', kind: 'ads' }), proposalView({ id: 'on', kind: 'activate', targetId: 't2' })];
    expect(growthNextDecision({ proposals, targets: [] }, { canConnectMeta: false })).toMatchObject({ kind: 'proposal', proposal: { id: 'on' } });
    expect(growthNextDecision({ proposals, targets: [] }, { canConnectMeta: false, targetId: 't1' })).toMatchObject({ proposal: { id: 'ads' } });
    const needsMeta = [targetView({ publishStatus: 'needs_meta' })];
    expect(growthNextDecision({ proposals: [], targets: needsMeta }, { canConnectMeta: true })).toMatchObject({ kind: 'connect_meta' });
    expect(growthNextDecision({ proposals: [], targets: needsMeta }, { canConnectMeta: false })).toBeNull();
  });
});

describe('target helpers', () => {
  it('offers the parts that can be redone, minus any being redone now', () => {
    const target = liveTarget({ publishStatus: 'none' });
    expect(targetChangeAreas(target, [])).toEqual(['ads', 'landing', 'audience']);
    expect(targetChangeAreas(target, [proposalView({ kind: 'audience', status: 'revising' })])).toEqual(['ads', 'landing']);
    expect(targetChangeAreas({ ...target, changeRequests: [{ area: 'ads', text: 'x', on: '', outcome: 'pending', failureCode: null }] }, [])).toEqual(['landing', 'audience']);
  });

  it('finds the feed lines about a target, older ones by its name', () => {
    const row = (id: string, extra: Partial<GrowthActivityView>): GrowthActivityView => ({ id, kind: 'ads_ready', byPilot: true, subject: null, count: null, targetId: null, on: `2026-11-0${id}T00:00:00.000Z`, ...extra });
    const activity = [row('1', { targetId: 't1' }), row('2', { targetId: 't2', subject: 'Digital signature' }), row('3', { subject: 'Digital signature' }), row('4', { kind: 'pilot_paused', subject: 'Digital signature' })];
    expect(targetActivity(activity, { id: 't1', name: 'Digital signature' }).map((entry) => entry.id)).toEqual(['1', '3']);
    expect(mergeActivity([row('1', {})], [row('2', {}), row('1', { count: 5 })]).map((entry) => [entry.id, entry.count])).toEqual([
      ['2', null],
      ['1', 5],
    ]);
  });
});
