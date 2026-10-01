/**
 * The narrator's voice of one ad (KAN-239): one choice for the whole ad, so every scene - generated
 * separately by the video model - speaks with the same voice. Gemini Omni has no voice id; the voice
 * is described in words, identically in every scene prompt, which is what keeps it consistent. Pure.
 */

export const AD_STUDIO_VOICE_PRESETS = ['woman_warm', 'woman_energetic', 'man_warm', 'man_deep', 'man_energetic'] as const;
export type AdStudioVoicePreset = (typeof AD_STUDIO_VOICE_PRESETS)[number];
export const AD_STUDIO_VOICE_DESCRIPTION_MAX = 300;

/** What each preset asks the video model for, in English. */
export const AD_STUDIO_VOICE_PRESET_DESCRIPTIONS: Record<AdStudioVoicePreset, string> = {
  woman_warm: 'a warm, friendly woman in her thirties with a clear, medium-pitched voice, calm and reassuring',
  woman_energetic: 'an upbeat, energetic young woman with a bright, lively voice',
  man_warm: 'a warm, confident man in his forties with a friendly, medium-deep voice',
  man_deep: 'a man with a deep, calm, authoritative voice, measured and trustworthy',
  man_energetic: 'an energetic young man with a lively, upbeat voice',
};

/** The ad's narrator voice: a preset, or the person's own description (`custom`). */
export interface AdStudioVoice {
  preset: AdStudioVoicePreset | 'custom';
  /** For `custom`: the voice in words ("an older man with a slight raspy voice, slow and warm"). */
  description?: string;
}

export function isAdStudioVoicePreset(value: unknown): value is AdStudioVoicePreset {
  return typeof value === 'string' && (AD_STUDIO_VOICE_PRESETS as readonly string[]).includes(value);
}

/** The words the video model gets for the voice, or null when the ad has none (the model chooses). */
export function voiceDescription(voice: AdStudioVoice | null | undefined): string | null {
  if (!voice) return null;
  if (voice.preset === 'custom') {
    const text = (voice.description ?? '').replace(/\s+/g, ' ').trim();
    return text || null;
  }
  return isAdStudioVoicePreset(voice.preset) ? AD_STUDIO_VOICE_PRESET_DESCRIPTIONS[voice.preset] : null;
}

export type AdStudioVoiceIssueCode = 'unknown_voice' | 'voice_description_required' | 'voice_description_too_long';

/** Why a voice cannot be saved; null when it can. */
export function voiceIssue(voice: AdStudioVoice): AdStudioVoiceIssueCode | null {
  if (voice.preset !== 'custom' && !isAdStudioVoicePreset(voice.preset)) return 'unknown_voice';
  if (voice.preset === 'custom') {
    const text = (voice.description ?? '').trim();
    if (!text) return 'voice_description_required';
    if (text.length > AD_STUDIO_VOICE_DESCRIPTION_MAX) return 'voice_description_too_long';
  }
  return null;
}
