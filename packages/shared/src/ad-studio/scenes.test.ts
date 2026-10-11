import { describe, expect, it } from 'vitest';
import {
  AD_STUDIO_MAX_SCENES,
  AD_STUDIO_MAX_TOTAL_SECONDS,
  fitAdStudioScenes,
  totalSceneSeconds,
  validateAdStudioScenes,
  type AdStudioScene,
} from './scenes';

function scene(id: string, durationSeconds: number, visualPrompt = `Shot ${id}`): AdStudioScene {
  return { id, durationSeconds, visualPrompt, voiceover: '', onScreenText: '' };
}

let counter = 0;
const makeId = () => `generated-${++counter}`;

describe('validateAdStudioScenes', () => {
  it('accepts a legal script: 6 scenes of 10 seconds is exactly one minute', () => {
    const scenes = Array.from({ length: 6 }, (_, index) => scene(`s${index}`, 10));
    expect(totalSceneSeconds(scenes)).toBe(AD_STUDIO_MAX_TOTAL_SECONDS);
    expect(validateAdStudioScenes(scenes)).toEqual([]);
  });

  it('names every broken rule, with the scene it is about', () => {
    const scenes = [scene('a', 2), scene('b', 11), scene('c', 4.5), scene('a', 5, '   ')];
    expect(validateAdStudioScenes(scenes)).toEqual([
      { code: 'scene_too_short', scene: 1 },
      { code: 'scene_too_long', scene: 2 },
      { code: 'scene_not_whole_seconds', scene: 3 },
      { code: 'empty_visual_prompt', scene: 4 },
      { code: 'duplicate_scene_id', scene: 4 },
    ]);
  });

  it('rejects an empty script, too many scenes, and a total over 60 seconds', () => {
    expect(validateAdStudioScenes([])).toEqual([{ code: 'no_scenes' }]);
    const long = Array.from({ length: 7 }, (_, index) => scene(`l${index}`, 10));
    expect(validateAdStudioScenes(long)).toContainEqual({ code: 'total_too_long' });
    const many = Array.from({ length: AD_STUDIO_MAX_SCENES + 1 }, (_, index) => scene(`m${index}`, 3));
    expect(validateAdStudioScenes(many)).toContainEqual({ code: 'too_many_scenes' });
  });
});

describe('fitAdStudioScenes', () => {
  it('clamps durations into whole seconds within 3-10 and trims text', () => {
    const fitted = fitAdStudioScenes([{ id: 'x', durationSeconds: 1.2, visualPrompt: '  wide shot  ', voiceover: ' hi ', onScreenText: '' }, scene('y', 14)], makeId);
    expect(fitted.map((s) => s.durationSeconds)).toEqual([3, 10]);
    expect(fitted[0]).toMatchObject({ visualPrompt: 'wide shot', voiceover: 'hi' });
    expect(validateAdStudioScenes(fitted)).toEqual([]);
  });

  it('brings a script over 60 seconds down by shortening the longest scenes first, never below 3', () => {
    const fitted = fitAdStudioScenes([scene('a', 10), scene('b', 10), scene('c', 10), scene('d', 10), scene('e', 10), scene('f', 10), scene('g', 6)], makeId);
    expect(totalSceneSeconds(fitted)).toBe(60);
    expect(fitted).toHaveLength(7);
    expect(Math.min(...fitted.map((s) => s.durationSeconds))).toBeGreaterThanOrEqual(3);
    expect(validateAdStudioScenes(fitted)).toEqual([]);
  });

  it('drops trailing scenes only once every scene is already at the 3-second floor', () => {
    const fitted = fitAdStudioScenes(Array.from({ length: 15 }, (_, index) => scene(`t${index}`, 3)).concat([scene('extra', 3)]), makeId);
    expect(fitted).toHaveLength(15);
    expect(totalSceneSeconds(fitted)).toBe(45);
    const overflow = fitAdStudioScenes(Array.from({ length: 15 }, (_, index) => scene(`o${index}`, 5)), makeId);
    expect(totalSceneSeconds(overflow)).toBeLessThanOrEqual(60);
    expect(overflow).toHaveLength(15);
  });

  it('gives duplicate or blank ids fresh ones, and keeps unique ids so rendered clips stay attached', () => {
    const fitted = fitAdStudioScenes([scene('keep', 4), scene('keep', 4), scene('  ', 4)], makeId);
    expect(fitted[0].id).toBe('keep');
    expect(new Set(fitted.map((s) => s.id)).size).toBe(3);
  });
});
