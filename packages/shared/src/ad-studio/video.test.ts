import { describe, expect, it } from 'vitest';
import type { AdStudioScene } from './scenes';
import {
  AD_STUDIO_CLIP_SLOW_MS,
  AD_STUDIO_CLIP_TIMEOUT_MS,
  AD_STUDIO_VIDEO_BRAND_BANNER,
  AD_STUDIO_VIDEO_BRAND_BANNER_OPACITY,
  FULL_FRAME_LINE,
  isClipSlow,
  NO_SPEECH_RULE,
  narrationIsSeparate,
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

const CONTEXT = { format: 'vertical' as const, language: 'he', productDescription: 'E-signatures for small law firms', voice: null, settings: null };

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

  it('never asks for readable text, and never sends a voice-over to the video model: the clip is asked for without any speech', () => {
    // Told "no one in the shot speaks", Omni still had people mouthing the narration (prod, 2026-11):
    // the narration is now spoken separately and mixed on, so the clip prompt carries none of it.
    const prompt = buildScenePrompt(scene('a', 5, 'A desk', 'Signed in seconds'), CONTEXT);
    expect(prompt).toContain('Do not show any readable text');
    expect(prompt).not.toContain('Signed in seconds');
    expect(prompt).not.toMatch(/narrator says|says, in/);
    expect(prompt).toContain(NO_SPEECH_RULE);
    expect(prompt).toMatch(/no dialogue, no voices/);
    expect(prompt).toMatch(/no one moves their lips as if speaking/);
    expect(prompt).toContain('Audio: soft background music that fits the mood, the same music in every scene, with natural ambient sound.');
    const vocalized = buildScenePrompt({ ...scene('a', 5, 'A desk', 'Signed in seconds'), pronunciation: 'Signed in seconds!' }, CONTEXT);
    expect(vocalized).not.toContain('Signed in seconds');
    expect(vocalized).not.toContain('nikud');
    const silent = buildScenePrompt(scene('a', 5, 'A desk', '   '), CONTEXT);
    expect(silent).toContain('No speech.');
    expect(silent).not.toContain('narrator');
  });

  it('keeps a person speaking on camera in the clip itself, lips in sync', () => {
    const prompt = buildScenePrompt({ ...scene('a', 5, 'A desk', 'Signed in seconds'), delivery: 'on_screen' }, CONTEXT);
    expect(prompt).toContain('says, in Hebrew: "Signed in seconds"');
    expect(prompt).toContain('Their lips move in sync with every word.');
    expect(prompt).not.toContain(NO_SPEECH_RULE);
  });

  it('decides which scenes get their narration mixed on separately', () => {
    expect(narrationIsSeparate(scene('a', 5, 'A desk', 'Hi'))).toBe(true);
    expect(narrationIsSeparate({ ...scene('a', 5, 'A desk', 'Hi'), delivery: 'voiceover' })).toBe(true);
    expect(narrationIsSeparate({ ...scene('a', 5, 'A desk', 'Hi'), delivery: 'on_screen' })).toBe(false);
    expect(narrationIsSeparate(scene('a', 5, 'A desk', '  '))).toBe(false);
  });

  it('shortens a long product description so every scene prompt stays compact', () => {
    const prompt = buildScenePrompt(scene('a', 5), { ...CONTEXT, productDescription: 'x'.repeat(1000) });
    expect(prompt).not.toContain('x'.repeat(400));
    expect(prompt.length).toBeLessThan(1000);
  });

  it('builds an edit instruction that keeps everything else and repeats the no-text rule', () => {
    expect(buildSceneEditInstruction('  make it night ')).toBe('make it night. Keep everything else the same. Do not add any readable text, captions or logos, and keep the footage full-bleed to every edge.');
    expect(buildSceneEditInstruction('Make it night.')).toMatch(/^Make it night\. Keep/);
    // A voice-over clip stays speechless through every edit: its narration is mixed on again afterwards.
    const speechless = buildSceneEditInstruction('make it night', { speechless: true });
    expect(speechless.endsWith(NO_SPEECH_RULE)).toBe(true);
    expect(buildSceneEditInstruction('make it night', { speechless: false })).not.toContain(NO_SPEECH_RULE);
  });

  it('asks for full-bleed footage and never mentions the brand banner laid over it afterwards', () => {
    // Told "a brand strip covers the lower part", the model painted an empty band with made-up logos there (prod, 2026-11).
    for (const format of ['vertical', 'horizontal'] as const) {
      const prompt = buildScenePrompt(scene('a', 5, 'A desk', 'Hi'), { ...CONTEXT, format });
      expect(prompt).toContain(FULL_FRAME_LINE);
      expect(prompt).not.toMatch(/brand strip|banner|upper two thirds|lower part/i);
      expect(prompt).toMatch(/captions, subtitles, titles, logos, signs or watermarks/);
    }
  });
});

describe('video brand banner and timeouts', () => {
  it('puts the banner in a band that ends at the bottom edge of either format', () => {
    for (const zone of Object.values(AD_STUDIO_VIDEO_BRAND_BANNER)) {
      expect(zone.top + zone.height).toBeCloseTo(1, 5);
      expect(zone.height).toBeGreaterThanOrEqual(0.08);
      expect(zone.height).toBeLessThanOrEqual(0.15);
    }
    expect(AD_STUDIO_VIDEO_BRAND_BANNER_OPACITY).toBeGreaterThan(0.8);
    expect(AD_STUDIO_VIDEO_BRAND_BANNER_OPACITY).toBeLessThanOrEqual(1);
  });

  it('calls a clip slow after the slow mark and gives up on it later', () => {
    const start = '2026-11-10T10:00:00.000Z';
    expect(isClipSlow(start, new Date(Date.parse(start) + AD_STUDIO_CLIP_SLOW_MS - 1))).toBe(false);
    expect(isClipSlow(start, new Date(Date.parse(start) + AD_STUDIO_CLIP_SLOW_MS + 1))).toBe(true);
    expect(AD_STUDIO_CLIP_TIMEOUT_MS).toBeGreaterThan(AD_STUDIO_CLIP_SLOW_MS);
    expect(AD_STUDIO_CLIP_TIMEOUT_MS).toBeLessThanOrEqual(15 * 60_000);
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

  it('marks voice-over scenes whose narration is mixed on separately, leaving silent and on-camera scenes as before', () => {
    // Fingerprints computed by the code before the separate narration (origin/main at a9922447): a
    // voice-over clip made then - narration spoken by the video model - must now read as out of date,
    // while on-camera and narration-free scenes keep their fingerprints, so their clips stay current.
    const VOICED = { ...CONTEXT, voice: 'a warm woman' };
    const before = { voiceOver: '67e2e5e4f25068eb', voiceOverWithVoice: '594d675c4c8709cf', onCamera: '6b18db02c9df62a1', silent: 'd209e673ec35e536' };
    expect(sceneFingerprint(base, CONTEXT)).not.toBe(before.voiceOver);
    expect(sceneFingerprint(base, VOICED)).not.toBe(before.voiceOverWithVoice);
    expect(sceneFingerprint({ ...base, delivery: 'voiceover' }, CONTEXT)).toBe(sceneFingerprint(base, CONTEXT));
    expect(sceneFingerprint({ ...base, delivery: 'on_screen', speaker: 'the lawyer' }, VOICED)).toBe(before.onCamera);
    expect(sceneFingerprint({ ...base, voiceover: '' }, CONTEXT)).toBe(before.silent);
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

  it('uses the version the person chose over a newer one, while it still matches the scene', () => {
    const chosen = { ...clip('a1', 'a', 1, 'ready', fp(0)), chosen: true };
    const states = sceneVideoStates([scenes[0]], [chosen, clip('a2', 'a', 2, 'ready', fp(0))], CONTEXT);
    expect(states[0].usable?.id).toBe('a1');
    // Once the scene changed, the choice no longer fits: the newest current clip is used.
    const stale = { ...clip('a1', 'a', 1, 'ready', 'old'), chosen: true };
    expect(sceneVideoStates([scenes[0]], [stale, clip('a2', 'a', 2, 'ready', fp(0))], CONTEXT)[0].usable?.id).toBe('a2');
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
