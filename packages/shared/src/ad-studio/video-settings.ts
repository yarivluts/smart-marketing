/**
 * The advanced video settings of one ad: the output resolution, the visual style, the background
 * music and what to keep out of the picture. Gemini Omni takes the resolution as a request field;
 * it has no style, music or negative-prompt parameters - its docs say to put them in the prompt -
 * so those become prompt lines, written the same way in every scene. Pure.
 */

/** 4K is left out on purpose: assembling 60 seconds of it on the server is slow and ad feeds do not need it. */
export const AD_STUDIO_VIDEO_RESOLUTIONS = ['360p', '720p', '1080p'] as const;
export type AdStudioVideoResolution = (typeof AD_STUDIO_VIDEO_RESOLUTIONS)[number];

export const AD_STUDIO_VISUAL_STYLES = ['commercial', 'cinematic', 'ugc_phone', 'studio_product', 'documentary', 'animation_3d', 'illustration_2d'] as const;
export type AdStudioVisualStyle = (typeof AD_STUDIO_VISUAL_STYLES)[number];

/** How each style is asked of the video model, in English. `commercial` is the wording clips were always made with. */
export const AD_STUDIO_VISUAL_STYLE_PROMPTS: Record<AdStudioVisualStyle, string> = {
  commercial: 'the same polished commercial style',
  cinematic: 'the same cinematic film look - shallow depth of field, dramatic lighting, smooth camera moves -',
  ugc_phone: 'the same authentic, handheld smartphone look of a real customer video (UGC), natural light, not overly polished,',
  studio_product: 'the same clean studio product-shot style - seamless background, soft studio lighting -',
  documentary: 'the same natural documentary style - real locations, available light, observational camera -',
  animation_3d: 'the same 3D animated style - soft, rounded, Pixar-like rendering -',
  illustration_2d: 'the same flat 2D motion-graphics illustration style',
};

export const AD_STUDIO_MUSIC_MODES = ['auto', 'none', 'custom'] as const;
export type AdStudioMusicMode = (typeof AD_STUDIO_MUSIC_MODES)[number];

export const AD_STUDIO_MUSIC_DESCRIPTION_MAX = 200;
export const AD_STUDIO_AVOID_MAX = 300;

export interface AdStudioVideoSettings {
  resolution: AdStudioVideoResolution;
  style: AdStudioVisualStyle;
  music: AdStudioMusicMode;
  /** For `custom` music: the music in words ("upbeat acoustic guitar"). */
  musicDescription?: string;
  /** What never to show, in words ("no animals, no cars"). */
  avoid?: string;
}

export const DEFAULT_AD_STUDIO_VIDEO_SETTINGS: AdStudioVideoSettings = { resolution: '720p', style: 'commercial', music: 'auto' };

function oneLine(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function oneOf<T extends string>(values: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Stored or partial settings with every field filled: unknown values fall back to the defaults, text is one trimmed line. */
export function normalizeVideoSettings(raw: Partial<AdStudioVideoSettings> | null | undefined): AdStudioVideoSettings {
  const defaults = DEFAULT_AD_STUDIO_VIDEO_SETTINGS;
  const music = oneOf(AD_STUDIO_MUSIC_MODES, raw?.music, defaults.music);
  const musicDescription = oneLine(raw?.musicDescription);
  const avoid = oneLine(raw?.avoid);
  return {
    resolution: oneOf(AD_STUDIO_VIDEO_RESOLUTIONS, raw?.resolution, defaults.resolution),
    style: oneOf(AD_STUDIO_VISUAL_STYLES, raw?.style, defaults.style),
    music: music === 'custom' && !musicDescription ? 'auto' : music,
    ...(music === 'custom' && musicDescription ? { musicDescription } : {}),
    ...(avoid ? { avoid } : {}),
  };
}

export type AdStudioVideoSettingsIssueCode = 'unknown_resolution' | 'unknown_style' | 'unknown_music' | 'music_description_required' | 'music_description_too_long' | 'avoid_too_long';

/** Why settings sent by a person or an agent cannot be saved; null when they can. */
export function videoSettingsIssue(raw: Partial<AdStudioVideoSettings>): AdStudioVideoSettingsIssueCode | null {
  if (raw.resolution !== undefined && !(AD_STUDIO_VIDEO_RESOLUTIONS as readonly string[]).includes(raw.resolution)) return 'unknown_resolution';
  if (raw.style !== undefined && !(AD_STUDIO_VISUAL_STYLES as readonly string[]).includes(raw.style)) return 'unknown_style';
  if (raw.music !== undefined && !(AD_STUDIO_MUSIC_MODES as readonly string[]).includes(raw.music)) return 'unknown_music';
  if (raw.music === 'custom' && !oneLine(raw.musicDescription)) return 'music_description_required';
  if (oneLine(raw.musicDescription).length > AD_STUDIO_MUSIC_DESCRIPTION_MAX) return 'music_description_too_long';
  if (oneLine(raw.avoid).length > AD_STUDIO_AVOID_MAX) return 'avoid_too_long';
  return null;
}

/** True when the settings are the defaults - clips made before the settings existed stay current. */
export function isDefaultVideoSettings(settings: AdStudioVideoSettings): boolean {
  return (
    settings.resolution === DEFAULT_AD_STUDIO_VIDEO_SETTINGS.resolution &&
    settings.style === DEFAULT_AD_STUDIO_VIDEO_SETTINGS.style &&
    settings.music === DEFAULT_AD_STUDIO_VIDEO_SETTINGS.music &&
    !settings.avoid
  );
}

/** The music line for a scene: under the narration when there is some, on its own otherwise. */
export function musicPromptLine(settings: AdStudioVideoSettings, withVoice: boolean): string {
  if (settings.music === 'none') return withVoice ? 'No music - only the voice and natural ambient sound.' : 'Audio: natural ambient sound that fits the shot. No music. No speech.';
  if (settings.music === 'custom' && settings.musicDescription) {
    return withVoice ? `Background music: ${settings.musicDescription}, softly under the voice - the same music in every scene.` : `Audio: background music - ${settings.musicDescription}, the same music in every scene - and natural ambient sound. No speech.`;
  }
  return withVoice ? 'Soft background music under the voice.' : 'Audio: background music and natural ambient sound that fit the mood. No speech.';
}
