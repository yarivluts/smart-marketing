import { describe, expect, it } from 'vitest';
import { applyNarrationMode, isAdStudioNarrationMode, narrationModeRules, narrationPresenter, resolveNarrationMode } from './narration';
import { buildSceneRewritePrompt, buildScriptPrompt, type AdStudioBriefInput } from './prompts';
import type { AdStudioScene } from './scenes';
import { sceneFingerprint } from './video';

function scene(id: string, overrides: Partial<AdStudioScene> = {}): AdStudioScene {
  return { id, durationSeconds: 5, visualPrompt: `Shot ${id}`, voiceover: `Line ${id}`, onScreenText: '', ...overrides };
}

const SCRIPT: AdStudioScene[] = [
  scene('a'),
  scene('b', { delivery: 'on_screen', speaker: 'a lawyer in a navy suit' }),
  scene('c', { voiceover: '' }),
  scene('d', { delivery: 'on_screen', speaker: 'a young man in a hoodie' }),
  scene('e'),
];

const BRIEF: AdStudioBriefInput = {
  name: 'Launch',
  objective: 'Trial signups',
  productDescription: 'E-signatures for lawyers',
  landingPageUrl: null,
  format: 'vertical',
  language: 'en',
  targetSeconds: 20,
};

describe('narration mode', () => {
  it('knows the three modes', () => {
    expect(['voiceover', 'on_camera', 'mixed'].every(isAdStudioNarrationMode)).toBe(true);
    expect(['', 'on_screen', null, 3].some(isAdStudioNarrationMode)).toBe(false);
  });

  it('follows the chosen mode, else the detected one, else voice-over - and keeps an older on-screen script mixed', () => {
    expect(resolveNarrationMode({ chosen: 'on_camera', detected: 'voiceover' })).toBe('on_camera');
    expect(resolveNarrationMode({ chosen: null, detected: 'on_camera' })).toBe('on_camera');
    expect(resolveNarrationMode({})).toBe('voiceover');
    expect(resolveNarrationMode({ scenes: SCRIPT })).toBe('mixed');
    // An on-screen delivery without narration says nothing about who speaks.
    expect(resolveNarrationMode({ scenes: [scene('x', { voiceover: ' ', delivery: 'on_screen' })] })).toBe('voiceover');
  });

  it('voiceover clears every on-screen speaker', () => {
    const result = applyNarrationMode(SCRIPT, 'voiceover');
    expect(result.every((entry) => entry.delivery === undefined && entry.speaker === undefined)).toBe(true);
    expect(result.every((entry) => !('delivery' in entry) && !('speaker' in entry))).toBe(true);
    // Everything else is untouched.
    expect(result.map((entry) => [entry.id, entry.voiceover, entry.visualPrompt])).toEqual(SCRIPT.map((entry) => [entry.id, entry.voiceover, entry.visualPrompt]));
  });

  it('on_camera puts one presenter on screen in every narrated scene, from the first to the last, never switching', () => {
    const result = applyNarrationMode(SCRIPT, 'on_camera');
    expect(narrationPresenter(SCRIPT)).toBe('a lawyer in a navy suit');
    expect(result.map((entry) => [entry.id, entry.delivery ?? null, entry.speaker ?? null])).toEqual([
      ['a', 'on_screen', 'a lawyer in a navy suit'],
      ['b', 'on_screen', 'a lawyer in a navy suit'],
      ['c', null, null],
      ['d', 'on_screen', 'a lawyer in a navy suit'],
      ['e', 'on_screen', 'a lawyer in a navy suit'],
    ]);
    // A named presenter wins; with no one named anywhere, every narrated scene is still on screen.
    expect(new Set(applyNarrationMode(SCRIPT, 'on_camera', '  a chef  ').flatMap((entry) => (entry.speaker ? [entry.speaker] : [])))).toEqual(new Set(['a chef']));
    const unnamed = applyNarrationMode([scene('a'), scene('b')], 'on_camera');
    expect(unnamed.map((entry) => [entry.delivery, entry.speaker])).toEqual([
      ['on_screen', undefined],
      ['on_screen', undefined],
    ]);
  });

  it('mixed leaves every scene as it is', () => {
    expect(applyNarrationMode(SCRIPT, 'mixed')).toEqual(SCRIPT);
  });

  it('changes the fingerprint of exactly the scenes whose speaker changes, so their clips go out of date', () => {
    const context = { format: 'vertical' as const, language: 'en', voice: null, settings: null };
    const before = SCRIPT.map((entry) => sceneFingerprint(entry, context));
    const after = applyNarrationMode(SCRIPT, 'voiceover').map((entry) => sceneFingerprint(entry, context));
    expect(before.map((value, index) => value !== after[index])).toEqual([false, true, false, true, false]);
  });

  it('states the mode in the script prompt, and asks the writer to read it from the brief when automatic', () => {
    const voiceover = buildScriptPrompt({ ...BRIEF, narrationMode: 'voiceover' }).system;
    expect(voiceover).toContain('Narration mode voiceover');
    expect(voiceover).toContain('No person in any shot talks');
    expect(voiceover).not.toContain('narrationMode: read the brief');
    const onCamera = buildScriptPrompt({ ...BRIEF, narrationMode: 'on_camera' }).system;
    expect(onCamera).toContain('Narration mode on_camera');
    expect(onCamera).toContain('never a different person mid-video');
    expect(buildScriptPrompt({ ...BRIEF, narrationMode: 'mixed' }).system).toContain('Narration mode mixed');
    const automatic = buildScriptPrompt(BRIEF).system;
    expect(automatic).toContain('narrationMode: read the brief');
    expect(automatic).toContain('When in doubt, "voiceover"');
    expect(narrationModeRules(null)).toHaveLength(2);
  });

  it('states the mode and who speaks when a scene is rewritten', () => {
    const prompt = buildSceneRewritePrompt({ ...BRIEF, narrationMode: 'on_camera' }, SCRIPT, 0, 'Shorter');
    expect(prompt.system).toContain('Narration mode on_camera');
    expect(prompt.user).toContain('Spoken on camera by: a lawyer in a navy suit');
    // Without a mode the rewrite stays voice-over.
    expect(buildSceneRewritePrompt(BRIEF, SCRIPT, 0, 'Shorter').system).toContain('Narration mode voiceover');
  });
});
