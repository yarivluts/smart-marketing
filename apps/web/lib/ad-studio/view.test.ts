import { describe, expect, it } from 'vitest';
import { adStudioStages, buildSceneTimeline, currentAssembledVideo, formatElapsed, limitUsedPercent, summarizeAdStudio } from './view';

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
  it('moves from script to video once the script has scenes; export stays upcoming', () => {
    expect(adStudioStages({ scenes: [] }).map((stage) => stage.status)).toEqual(['done', 'current', 'upcoming', 'upcoming']);
    expect(adStudioStages({ scenes: [{}] }).map((stage) => stage.status)).toEqual(['done', 'done', 'current', 'upcoming']);
  });

  it('keeps video current while scenes render and marks it done once the current clips are assembled', () => {
    expect(adStudioStages({ scenes: [{}, {}] }, { rendered: 1, scenes: 2, assembled: false }).map((stage) => stage.status)).toEqual(['done', 'done', 'current', 'upcoming']);
    expect(adStudioStages({ scenes: [{}, {}] }, { rendered: 2, scenes: 2, assembled: true }).map((stage) => stage.status)).toEqual(['done', 'done', 'done', 'upcoming']);
    expect(adStudioStages({ scenes: [] }, { rendered: 0, scenes: 0, assembled: true })[2].status).toBe('upcoming');
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
