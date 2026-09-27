import { describe, expect, it } from 'vitest';
import { adStudioStages, buildSceneTimeline, limitUsedPercent, summarizeAdStudio } from './view';

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
