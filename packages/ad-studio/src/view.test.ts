import { describe, expect, it } from 'vitest';
import { imageConceptFingerprint } from '@growthos/shared';
import {
  adStudioImageSlots,
  adStudioStages,
  buildSceneTimeline,
  currentAssembledVideo,
  formatElapsed,
  limitUsedPercent,
  missingImageRenders,
  planningSourceChecklist,
  shortUrl,
  sortRecommendations,
  summarizeAdStudio,
  type AdStudioImageView,
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
  it('runs brief -> plan -> script -> images -> video -> export; export stays upcoming', () => {
    const ids = adStudioStages({ scenes: [] }).map((stage) => stage.id);
    expect(ids).toEqual(['brief', 'plan', 'script', 'images', 'video', 'export']);
    expect(adStudioStages({ scenes: [], plan: null }).map((stage) => stage.status)).toEqual(['done', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  });

  it('moves to the script once planned, and to video once the script has scenes', () => {
    expect(adStudioStages({ scenes: [], plan: { summary: 'x' } }).map((stage) => stage.status)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(adStudioStages({ scenes: [{}], plan: { summary: 'x' } }).map((stage) => stage.status)).toEqual(['done', 'done', 'done', 'upcoming', 'current', 'upcoming']);
  });

  it('a script written without deep analysis shows the plan as skipped, not pending', () => {
    expect(adStudioStages({ scenes: [{}] }).map((stage) => stage.status)).toEqual(['done', 'skipped', 'done', 'upcoming', 'current', 'upcoming']);
  });

  it('keeps video current while scenes render and marks it done once the current clips are assembled', () => {
    const plan = { summary: 'x' };
    expect(adStudioStages({ scenes: [{}, {}], plan }, { rendered: 1, scenes: 2, assembled: false }).map((stage) => stage.status)).toEqual(['done', 'done', 'done', 'upcoming', 'current', 'upcoming']);
    expect(adStudioStages({ scenes: [{}, {}], plan }, { rendered: 2, scenes: 2, assembled: true }).map((stage) => stage.status)).toEqual(['done', 'done', 'done', 'upcoming', 'done', 'current']);
    expect(adStudioStages({ scenes: [{}] }, { rendered: 1, scenes: 1, assembled: true }).map((stage) => stage.status)).toEqual(['done', 'skipped', 'done', 'upcoming', 'done', 'current']);
    const unscripted = adStudioStages({ scenes: [] }, { rendered: 0, scenes: 0, assembled: true });
    expect(unscripted.find((stage) => stage.id === 'video')?.status).toBe('upcoming');
  });

  it('reads images as current while ideas miss an image and done when every placement has a current one', () => {
    const imagesStatus = (images: { current: number; total: number } | null) => adStudioStages({ scenes: [] }, undefined, false, images).find((stage) => stage.id === 'images')?.status;
    expect(imagesStatus(null)).toBe('upcoming');
    expect(imagesStatus({ current: 0, total: 0 })).toBe('upcoming');
    expect(imagesStatus({ current: 1, total: 4 })).toBe('current');
    expect(imagesStatus({ current: 4, total: 4 })).toBe('done');
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

describe('image slots', () => {
  const concept = { id: 'c1', visualPrompt: 'A desk', headline: 'Sign fast', formats: ['square' as const, 'story' as const] };
  const fingerprint = (format: 'square' | 'story', headline = 'Sign fast') => imageConceptFingerprint({ visualPrompt: 'A desk', headline }, format, 'en');
  const image = (overrides: Partial<AdStudioImageView>): AdStudioImageView => ({
    id: 'i',
    conceptId: 'c1',
    format: 'square',
    kind: 'render',
    version: 1,
    status: 'ready',
    selected: true,
    parentImageId: null,
    instruction: null,
    conceptFingerprint: fingerprint('square'),
    failureCode: null,
    mimeType: 'image/png',
    requestedOn: '2026-09-28T10:00:00.000Z',
    completedOn: '2026-09-28T10:00:10.000Z',
    ...overrides,
  });

  it('gives one slot per concept and placement, with its selected version and whether it matches the concept now', () => {
    const slots = adStudioImageSlots([concept], [image({ id: 'a' }), image({ id: 'b', version: 2, selected: false })], 'en');
    expect(slots.map((slot) => [slot.format, slot.selected?.id ?? null, slot.current, slot.versions.map((v) => v.id)])).toEqual([
      ['square', 'a', true, ['b', 'a']],
      ['story', null, false, []],
    ]);
    const edited = adStudioImageSlots([{ ...concept, headline: 'Changed' }], [image({ id: 'a' })], 'en');
    expect(edited[0].current).toBe(false);
  });

  it('lists the renders still needed, skipping slots in flight and, from a time on, slots that already failed', () => {
    const slots = adStudioImageSlots(
      [concept],
      [image({ id: 'a' }), image({ id: 'f', format: 'story', status: 'failed', selected: false, conceptFingerprint: fingerprint('story'), requestedOn: '2026-09-28T11:00:00.000Z' })],
      'en',
    );
    expect(missingImageRenders(slots, [concept], 'en')).toEqual([{ conceptId: 'c1', format: 'story' }]);
    expect(missingImageRenders(slots, [concept], 'en', '2026-09-28T10:30:00.000Z')).toEqual([]);
    const inFlight = adStudioImageSlots([concept], [image({ id: 'g', format: 'story', status: 'generating', selected: false })], 'en');
    expect(missingImageRenders(inFlight, [concept], 'en')).toEqual([{ conceptId: 'c1', format: 'square' }]);
  });
});
