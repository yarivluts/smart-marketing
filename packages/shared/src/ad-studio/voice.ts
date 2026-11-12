/**
 * The narrator's voice of one ad (KAN-239): one choice for the whole ad, so every scene - generated
 * separately by the video model - speaks with the same voice. Gemini Omni has no voice id; the voice
 * is described in words, identically in every scene prompt, which is what keeps it consistent (for a
 * person on camera). A voice-over is spoken by the TTS narrator instead, by voice name (see
 * `ttsVoiceName`). Pure.
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

/**
 * The text-to-speech narrator of a voice-over (Gemini TTS prebuilt voices; see `narrationIsSeparate`
 * in `video.ts`). Unlike the video model, the speech model takes a voice by name, so each preset maps
 * to one fixed voice and every scene of the ad is spoken by it.
 */
export const AD_STUDIO_TTS_VOICES: Record<AdStudioVoicePreset, string> = {
  woman_warm: 'Sulafat',
  woman_energetic: 'Laomedeia',
  man_warm: 'Achird',
  man_deep: 'Charon',
  man_energetic: 'Puck',
};

/** The narrator when the ad chose no voice. */
export const AD_STUDIO_DEFAULT_TTS_VOICE = AD_STUDIO_TTS_VOICES.woman_warm;

/** The closest preset to a custom voice description, by its words: woman or man, lively, deep, else warm. */
export function presetForVoiceDescription(description: string): AdStudioVoicePreset {
  const text = description.toLowerCase();
  const woman = /\b(woman|women|female|girl|lady|she|her|mother|mom|grandmother)\b/.test(text);
  const man = /\b(man|men|male|boy|guy|he|his|father|dad|grandfather)\b/.test(text);
  const energetic = /\b(energetic|upbeat|lively|excited|exciting|bright|enthusiastic|cheerful|young|dynamic|fast)\b/.test(text);
  const deep = /\b(deep|low|bass|baritone|authoritative|gravelly|raspy|husky|serious)\b/.test(text);
  if (woman && !man) return energetic ? 'woman_energetic' : 'woman_warm';
  if (man) return deep ? 'man_deep' : energetic ? 'man_energetic' : 'man_warm';
  return energetic ? 'woman_energetic' : deep ? 'man_deep' : 'woman_warm';
}

/** The prebuilt speech voice that narrates an ad: fixed per preset, matched by words for a custom voice. */
export function ttsVoiceName(voice: AdStudioVoice | null | undefined): string {
  if (!voice) return AD_STUDIO_DEFAULT_TTS_VOICE;
  if (voice.preset === 'custom') {
    const text = (voice.description ?? '').trim();
    return text ? AD_STUDIO_TTS_VOICES[presetForVoiceDescription(text)] : AD_STUDIO_DEFAULT_TTS_VOICE;
  }
  return isAdStudioVoicePreset(voice.preset) ? AD_STUDIO_TTS_VOICES[voice.preset] : AD_STUDIO_DEFAULT_TTS_VOICE;
}

/**
 * The one delivery style the narrator is given, the same for every scene of the ad (the speech model's
 * guidance: a short constant style, with who the voice is left to the voice itself).
 */
export function ttsNarrationStyle(voice: AdStudioVoice | null | undefined, languageName: string): string {
  const preset = !voice ? 'woman_warm' : voice.preset === 'custom' ? presetForVoiceDescription(voice.description ?? '') : voice.preset;
  const tone = preset === 'woman_energetic' || preset === 'man_energetic' ? 'Upbeat, lively and clear' : preset === 'man_deep' ? 'Calm, confident and clear' : 'Warm, friendly and clear';
  return `${tone} video ad narration in ${languageName}, at a natural, unhurried pace.`;
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
