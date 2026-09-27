import { describe, expect, it } from 'vitest';
import { adStudioStages, buildSceneTimeline, limitUsedPercent, planningSourceChecklist, shortUrl, sortRecommendations, summarizeAdStudio } from './view';

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
