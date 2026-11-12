import { describe, expect, it } from 'vitest';
import type { AdStudioScene } from './scenes';
import { buildScenePrompt, sceneFingerprint } from './video';
import {
  AD_STUDIO_DEFAULT_TTS_VOICE,
  AD_STUDIO_TTS_VOICES,
  AD_STUDIO_VOICE_PRESET_DESCRIPTIONS,
  AD_STUDIO_VOICE_PRESETS,
  presetForVoiceDescription,
  ttsNarrationStyle,
  ttsVoiceName,
  voiceDescription,
  voiceIssue,
} from './voice';

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

  it('asks the video model for the voice only for a person on screen; a voice-over clip is speechless', () => {
    const voice = voiceDescription({ preset: 'woman_warm' });
    const narrated = buildScenePrompt(scene(), { ...CONTEXT, voice });
    expect(narrated).not.toContain(voice as string);
    expect(narrated).not.toContain('Sign in seconds.');
    const spoken = buildScenePrompt(scene({ delivery: 'on_screen' }), { ...CONTEXT, voice });
    expect(spoken).toContain(`They speak with the voice of ${voice} - the same voice in every scene of this ad.`);
  });

  it('maps every preset to one fixed speech voice, a custom description by its words, and no voice to the default', () => {
    expect(new Set(Object.values(AD_STUDIO_TTS_VOICES)).size).toBe(AD_STUDIO_VOICE_PRESETS.length);
    for (const preset of AD_STUDIO_VOICE_PRESETS) expect(ttsVoiceName({ preset })).toBe(AD_STUDIO_TTS_VOICES[preset]);
    expect(ttsVoiceName(null)).toBe(AD_STUDIO_DEFAULT_TTS_VOICE);
    expect(ttsVoiceName({ preset: 'custom', description: '  ' })).toBe(AD_STUDIO_DEFAULT_TTS_VOICE);
    expect(ttsVoiceName({ preset: 'robot' as never })).toBe(AD_STUDIO_DEFAULT_TTS_VOICE);
    expect(presetForVoiceDescription('an older man with a slight raspy voice, slow and warm')).toBe('man_deep');
    expect(presetForVoiceDescription('A friendly guy next door')).toBe('man_warm');
    expect(presetForVoiceDescription('an energetic young man')).toBe('man_energetic');
    expect(presetForVoiceDescription('a cheerful woman')).toBe('woman_energetic');
    expect(presetForVoiceDescription('a calm grandmother')).toBe('woman_warm');
    expect(presetForVoiceDescription('soothing and soft')).toBe('woman_warm');
    // Deterministic: the same words always give the same voice, so every scene sounds alike.
    expect(ttsVoiceName({ preset: 'custom', description: 'A deep male voice' })).toBe(ttsVoiceName({ preset: 'custom', description: 'A deep male voice' }));
    expect(ttsVoiceName({ preset: 'custom', description: 'A deep male voice' })).toBe(AD_STUDIO_TTS_VOICES.man_deep);
  });

  it('gives the speech narrator one short style per ad, in the ad language', () => {
    expect(ttsNarrationStyle({ preset: 'woman_warm' }, 'Hebrew')).toBe('Warm, friendly and clear video ad narration in Hebrew, at a natural, unhurried pace.');
    expect(ttsNarrationStyle({ preset: 'man_energetic' }, 'English')).toMatch(/^Upbeat, lively and clear .* in English/);
    expect(ttsNarrationStyle(null, 'English')).toMatch(/^Warm/);
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
