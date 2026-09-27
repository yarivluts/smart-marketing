import { describe, expect, it } from 'vitest';
import {
  adStudioStages,
  buildSceneTimeline,
  currentAssembledVideo,
  formatElapsed,
  limitUsedPercent,
  planningSourceChecklist,
  shortUrl,
  sortRecommendations,
  summarizeAdStudio,
} from './view';

describe('buildSceneTimeline', () => {
  it('lays scenes on the 60-second ruler with start offsets and shares', () => {
    const timeline = buildSceneTimeline([
      { id: 'a', durationSeconds: 6 },
      { id: 'b', durationSeconds: 12 },
    ]);
    expect(timeline).toEqual([
      { id: 'a', position: 1, durationSeconds: 6, startSeconds: 0, widthPercent: 10, overLimit: false },
      { id: 'b', position: 2, durationSeconds: 12, startSeconds: 6, widthPercent: 20, overLimit: false },
    ]);
  });

  it('marks the scene that runs past the minute, and treats a non-number duration as zero', () => {
    const timeline = buildSceneTimeline([
      { id: 'a', durationSeconds: 55 },
      { id: 'b', durationSeconds: 10 },
      { id: 'c', durationSeconds: Number.NaN },
    ]);
    expect(timeline.map((segment) => segment.overLimit)).toEqual([false, true, true]);
    expect(timeline[2]).toMatchObject({ durationSeconds: 0, startSeconds: 65 });
  });
});

describe('adStudioStages', () => {
  it('runs brief -> plan -> script -> video -> export; export stays upcoming', () => {
    const ids = adStudioStages({ scenes: [] }).map((stage) => stage.id);
    expect(ids).toEqual(['brief', 'plan', 'script', 'video', 'export']);
    expect(adStudioStages({ scenes: [], plan: null }).map((stage) => stage.status)).toEqual(['done', 'current', 'upcoming', 'upcoming', 'upcoming']);
  });

  it('moves to the script once planned, and to video once the script has scenes', () => {
    expect(adStudioStages({ scenes: [], plan: { summary: 'x' } }).map((stage) => stage.status)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming']);
    expect(adStudioStages({ scenes: [{}], plan: { summary: 'x' } }).map((stage) => stage.status)).toEqual(['done', 'done', 'done', 'current', 'upcoming']);
  });

  it('a script written without deep analysis shows the plan as skipped, not pending', () => {
    expect(adStudioStages({ scenes: [{}] }).map((stage) => stage.status)).toEqual(['done', 'skipped', 'done', 'current', 'upcoming']);
  });

  it('keeps video current while scenes render and marks it done once the current clips are assembled', () => {
    const plan = { summary: 'x' };
    expect(adStudioStages({ scenes: [{}, {}], plan }, { rendered: 1, scenes: 2, assembled: false }).map((stage) => stage.status)).toEqual(['done', 'done', 'done', 'current', 'upcoming']);
    expect(adStudioStages({ scenes: [{}, {}], plan }, { rendered: 2, scenes: 2, assembled: true }).map((stage) => stage.status)).toEqual(['done', 'done', 'done', 'done', 'current']);
    expect(adStudioStages({ scenes: [{}] }, { rendered: 1, scenes: 1, assembled: true }).map((stage) => stage.status)).toEqual(['done', 'skipped', 'done', 'done', 'current']);
    const unscripted = adStudioStages({ scenes: [] }, { rendered: 0, scenes: 0, assembled: true });
    expect(unscripted.find((stage) => stage.id === 'video')?.status).toBe('upcoming');
  });

  it('makes export the next step once the video is assembled, and done once an upload succeeded', () => {
    const exportStatus = (video: { rendered: number; scenes: number; assembled: boolean } | undefined, exported: boolean) =>
      adStudioStages({ scenes: [{}] }, video, exported).find((stage) => stage.id === 'export')?.status;
    expect(exportStatus({ rendered: 1, scenes: 1, assembled: false }, false)).toBe('upcoming');
    expect(exportStatus({ rendered: 1, scenes: 1, assembled: true }, false)).toBe('current');
    expect(exportStatus({ rendered: 1, scenes: 1, assembled: true }, true)).toBe('done');
    expect(exportStatus(undefined, false)).toBe('upcoming');
  });
});

describe('currentAssembledVideo and formatElapsed', () => {
  const videos = [
    { id: 'v3', status: 'failed', clipIds: ['a', 'b'] },
    { id: 'v2', status: 'ready', clipIds: ['a', 'b'] },
    { id: 'v1', status: 'ready', clipIds: ['a'] },
  ];

  it('picks the newest ready video and says whether it matches the clips an assembly would use now', () => {
    expect(currentAssembledVideo(videos, ['a', 'b'])).toEqual({ latest: videos[1], current: true });
    expect(currentAssembledVideo(videos, ['a', 'c']).current).toBe(false);
    expect(currentAssembledVideo(videos, ['b', 'a']).current).toBe(false);
    expect(currentAssembledVideo(videos, null)).toEqual({ latest: videos[1], current: false });
    expect(currentAssembledVideo([], ['a'])).toEqual({ latest: null, current: false });
  });

  it('formats elapsed generation time as m:ss, never negative', () => {
    expect(formatElapsed('2026-09-27T10:00:00Z', new Date('2026-09-27T10:01:05Z'))).toBe('1:05');
    expect(formatElapsed('2026-09-27T10:00:00Z', new Date('2026-09-27T09:59:00Z'))).toBe('0:00');
  });
});

describe('summarizeAdStudio and limitUsedPercent', () => {
  it('counts ads, scripted ads and their total length', () => {
    expect(summarizeAdStudio([{ scenes: [] }, { scenes: [{ durationSeconds: 10 }, { durationSeconds: 5 }] }, { scenes: [{ durationSeconds: 30 }] }])).toEqual({
      briefs: 3,
      scripted: 2,
      scriptedSeconds: 45,
    });
  });

  it('caps at 100 and reads a zero limit as full', () => {
    expect(limitUsedPercent(5, 50)).toBe(10);
    expect(limitUsedPercent(80, 50)).toBe(100);
    expect(limitUsedPercent(0, 0)).toBe(100);
  });
});

describe('planningSourceChecklist and sortRecommendations', () => {
  it('lists the four sources with their reason when unavailable, then market knowledge as model-only', () => {
    const rows = planningSourceChecklist({
      landingPage: { status: 'unavailable', reason: 'timeout' },
      results: { status: 'unavailable', reason: 'warehouse_not_configured' },
      campaigns: { status: 'ok', campaigns: [] },
      keywords: { status: 'unavailable', reason: 'no_google_ads_credential' },
    });
    expect(rows).toEqual([
      { id: 'landing_page', status: 'unavailable', reason: 'timeout' },
      { id: 'results', status: 'unavailable', reason: 'warehouse_not_configured' },
      { id: 'campaigns', status: 'ok', reason: null },
      { id: 'keywords', status: 'unavailable', reason: 'no_google_ads_credential' },
      { id: 'market', status: 'model', reason: null },
    ]);
  });

  it('puts high priority first and keeps the model order within a priority', () => {
    const rec = (title: string, priority: 'high' | 'medium' | 'low') => ({ title, rationale: '', priority, evidence: [] });
    expect(sortRecommendations([rec('a', 'low'), rec('b', 'high'), rec('c', 'medium'), rec('d', 'high')]).map((r) => r.title)).toEqual(['b', 'd', 'c', 'a']);
  });
});

describe('shortUrl', () => {
  it('drops the protocol and a trailing slash, and leaves anything else alone', () => {
    expect(shortUrl('https://example.com/lawyers/')).toBe('example.com/lawyers');
    expect(shortUrl('http://example.com')).toBe('example.com');
    expect(shortUrl('/pricing')).toBe('/pricing');
  });
});
