import { describe, expect, it } from 'vitest';
import type { AdStudioScene } from './scenes';
import { buildScenePrompt, sceneFingerprint } from './video';
import { AD_STUDIO_VOICE_PRESET_DESCRIPTIONS, voiceDescription, voiceIssue } from './voice';

const CONTEXT = { format: 'vertical' as const, language: 'en', productDescription: 'E-signatures for lawyers', voice: null, settings: null };

function scene(overrides: Partial<AdStudioScene> = {}): AdStudioScene {
  return { id: 's1', durationSeconds: 5, visualPrompt: 'Two lawyers at a desk', voiceover: 'Sign in seconds.', onScreenText: '', ...overrides };
}

describe('the narrator voice of an ad', () => {
  it('describes a preset in fixed words and a custom voice in the person\'s own, collapsed to one line', () => {
    expect(voiceDescription(null)).toBeNull();
    expect(voiceDescription({ preset: 'man_deep' })).toBe(AD_STUDIO_VOICE_PRESET_DESCRIPTIONS.man_deep);
    expect(voiceDescription({ preset: 'custom', description: '  an older man,\n slow and warm ' })).toBe('an older man, slow and warm');
    expect(voiceDescription({ preset: 'custom', description: '  ' })).toBeNull();
    expect(voiceDescription({ preset: 'robot' as never })).toBeNull();
  });

  it('refuses an unknown preset, an empty custom description and an over-long one', () => {
    expect(voiceIssue({ preset: 'woman_warm' })).toBeNull();
    expect(voiceIssue({ preset: 'robot' as never })).toBe('unknown_voice');
    expect(voiceIssue({ preset: 'custom' })).toBe('voice_description_required');
    expect(voiceIssue({ preset: 'custom', description: 'x'.repeat(301) })).toBe('voice_description_too_long');
    expect(voiceIssue({ preset: 'custom', description: 'x'.repeat(300) })).toBeNull();
  });

  it('asks for the same voice in every scene, for a voice-over and for a person on screen', () => {
    const voice = voiceDescription({ preset: 'woman_warm' });
    const narrated = buildScenePrompt(scene(), { ...CONTEXT, voice });
    expect(narrated).toContain(`a voice-over narrator - ${voice} - says, in English: "Sign in seconds."`);
    expect(narrated).toContain('It is exactly the same narrator voice in every scene of this ad.');
    const spoken = buildScenePrompt(scene({ delivery: 'on_screen' }), { ...CONTEXT, voice });
    expect(spoken).toContain(`They speak with the voice of ${voice} - the same voice in every scene of this ad.`);
    // No voice chosen: the earlier prompt, word for word.
    expect(buildScenePrompt(scene(), CONTEXT)).toContain('a warm, clear voice-over narrator says, in English');
  });

  it('makes narrated clips out of date when the voice changes, and leaves silent scenes and earlier clips alone', () => {
    const before = sceneFingerprint(scene(), CONTEXT);
    const withVoice = sceneFingerprint(scene(), { ...CONTEXT, voice: 'a deep voice' });
    expect(withVoice).not.toBe(before);
    expect(sceneFingerprint(scene(), { ...CONTEXT, voice: 'another voice' })).not.toBe(withVoice);
    const silent = scene({ voiceover: '' });
    expect(sceneFingerprint(silent, { ...CONTEXT, voice: 'a deep voice' })).toBe(sceneFingerprint(silent, CONTEXT));
  });
});
