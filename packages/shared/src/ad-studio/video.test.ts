import { describe, expect, it } from 'vitest';
import type { AdStudioScene } from './scenes';
import {
  assemblyPlan,
  buildSceneEditInstruction,
  buildScenePrompt,
  clipsByScene,
  renderAllCost,
  sceneFingerprint,
  sceneVideoStates,
  summarizeVideoProgress,
  type AdStudioClipSummary,
} from './video';

const CONTEXT = { format: 'vertical' as const, language: 'he', productDescription: 'E-signatures for small law firms' };

function scene(id: string, durationSeconds: number, visualPrompt = `Shot ${id}`, voiceover = ''): AdStudioScene {
  return { id, durationSeconds, visualPrompt, voiceover, onScreenText: '' };
}

function clip(id: string, sceneId: string, version: number, status: AdStudioClipSummary['status'], fingerprint: string, durationSeconds = 5): AdStudioClipSummary {
  return { id, sceneId, version, status, sceneFingerprint: fingerprint, durationSeconds };
}

describe('buildScenePrompt', () => {
  it('states the shot, its length as seconds and a timecode, the frame, and the product context', () => {
    const prompt = buildScenePrompt(scene('a', 6, '  A lawyer\nsigns on a phone  '), CONTEXT);
    expect(prompt.split('\n')[0]).toBe('[0-6s] A lawyer signs on a phone');
    expect(prompt).toContain('One continuous 6-second shot in a single unbroken scene, no scene cuts, in a vertical 9:16 frame for phones.');
    expect(prompt).toContain('short video ad for: E-signatures for small law firms');
    expect(buildScenePrompt(scene('a', 6), { ...CONTEXT, format: 'horizontal' })).toContain('horizontal 16:9 frame');
  });

  it('never asks for readable text, and speaks the voiceover in the ad language', () => {
    const prompt = buildScenePrompt(scene('a', 5, 'A desk', 'Signed in seconds'), CONTEXT);
    expect(prompt).toContain('Do not show any readable text');
    expect(prompt).toContain('narrator says, in Hebrew: "Signed in seconds"');
    const silent = buildScenePrompt(scene('a', 5, 'A desk', '   '), CONTEXT);
    expect(silent).toContain('No speech.');
    expect(silent).not.toContain('narrator');
  });

  it('shortens a long product description so every scene prompt stays compact', () => {
    const prompt = buildScenePrompt(scene('a', 5), { ...CONTEXT, productDescription: 'x'.repeat(1000) });
    expect(prompt.length).toBeLessThan(900);
  });

  it('builds an edit instruction that keeps everything else and repeats the no-text rule', () => {
    expect(buildSceneEditInstruction('  make it night ')).toBe('make it night. Keep everything else the same. Do not add any readable text, captions or logos.');
    expect(buildSceneEditInstruction('Make it night.')).toMatch(/^Make it night\. Keep/);
  });
});

describe('sceneFingerprint', () => {
  const base = scene('a', 5, 'A desk', 'Hi');

  it('is stable, and ignores whitespace-only changes, the scene id and on-screen text', () => {
    const fingerprint = sceneFingerprint(base, CONTEXT);
    expect(fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(sceneFingerprint({ ...base, visualPrompt: ' A  desk ' }, CONTEXT)).toBe(fingerprint);
    expect(sceneFingerprint({ ...base, id: 'other', onScreenText: 'Sale' } as AdStudioScene, CONTEXT)).toBe(fingerprint);
  });

  it('changes with the length, the shot, the narration, the frame and the language', () => {
    const fingerprint = sceneFingerprint(base, CONTEXT);
    const variants = [
      sceneFingerprint({ ...base, durationSeconds: 6 }, CONTEXT),
      sceneFingerprint({ ...base, visualPrompt: 'A table' }, CONTEXT),
      sceneFingerprint({ ...base, voiceover: 'Hello' }, CONTEXT),
      sceneFingerprint(base, { ...CONTEXT, format: 'horizontal' }),
      sceneFingerprint(base, { ...CONTEXT, language: 'en' }),
    ];
    expect(new Set([fingerprint, ...variants]).size).toBe(6);
  });
});

describe('scene video states, progress and the assembly plan', () => {
  const scenes = [scene('a', 5), scene('b', 8), scene('c', 4)];
  const fp = (index: number) => sceneFingerprint(scenes[index], CONTEXT);

  it('groups clips per scene, newest version first', () => {
    const grouped = clipsByScene([clip('1', 'a', 1, 'ready', 'x'), clip('2', 'a', 3, 'ready', 'x'), clip('3', 'a', 2, 'failed', 'x')]);
    expect(grouped.get('a')?.map((entry) => entry.id)).toEqual(['2', '3', '1']);
  });

  it('reads none, generating, ready, out of date and failed per scene', () => {
    const clips = [
      clip('a1', 'a', 1, 'ready', fp(0)),
      clip('a2', 'a', 2, 'generating', fp(0)),
      clip('b1', 'b', 1, 'ready', 'stale-fingerprint'),
      clip('c1', 'c', 1, 'ready', fp(2)),
      clip('c2', 'c', 2, 'failed', fp(2)),
    ];
    const states = sceneVideoStates([...scenes, scene('d', 3)], clips, CONTEXT);
    expect(states.map((entry) => entry.state)).toEqual(['generating', 'out_of_date', 'ready', 'none']);
    expect(states[0].usable?.id).toBe('a1');
    expect(states[2]).toMatchObject({ latest: { id: 'c2' }, usable: { id: 'c1' } });

    const onlyFailed = sceneVideoStates([scenes[0]], [clip('f', 'a', 1, 'failed', fp(0))], CONTEXT);
    expect(onlyFailed[0].state).toBe('failed');
  });

  it('counts progress and allows assembly only when every scene has a current ready clip', () => {
    const partial = sceneVideoStates(scenes, [clip('a1', 'a', 1, 'ready', fp(0)), clip('b1', 'b', 1, 'ready', 'old')], CONTEXT);
    expect(summarizeVideoProgress(partial, scenes)).toEqual({ scenes: 3, rendered: 1, generating: 0, failed: 0, outOfDate: 1, canAssemble: false, totalSeconds: 17 });
    expect(renderAllCost(partial, scenes)).toEqual({ sceneIds: ['b', 'c'], seconds: 12 });

    const clips = scenes.map((entry, index) => clip(`${entry.id}1`, entry.id, 1, 'ready', fp(index), 10));
    const complete = sceneVideoStates(scenes, clips, CONTEXT);
    expect(summarizeVideoProgress(complete, scenes)).toMatchObject({ rendered: 3, canAssemble: true });
    expect(renderAllCost(complete, scenes)).toEqual({ sceneIds: [], seconds: 0 });
    expect(assemblyPlan(scenes, clips, CONTEXT)?.map((entry) => [entry.sceneId, entry.clip.id, entry.seconds])).toEqual([
      ['a', 'a1', 5],
      ['b', 'b1', 8],
      ['c', 'c1', 4],
    ]);
  });

  it('has no plan with a missing scene, no scenes, or a script over 60 seconds', () => {
    expect(assemblyPlan(scenes, [clip('a1', 'a', 1, 'ready', fp(0))], CONTEXT)).toBeNull();
    expect(assemblyPlan([], [], CONTEXT)).toBeNull();
    const long = Array.from({ length: 7 }, (_, index) => scene(`l${index}`, 10));
    const longClips = long.map((entry) => clip(`${entry.id}c`, entry.id, 1, 'ready', sceneFingerprint(entry, CONTEXT)));
    expect(assemblyPlan(long, longClips, CONTEXT)).toBeNull();
  });
});
