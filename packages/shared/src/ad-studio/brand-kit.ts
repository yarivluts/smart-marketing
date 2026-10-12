/**
 * A project's brand kit: what every ad the studio writes or draws must keep consistent - the brand
 * name exactly as written, the tone of voice, words never to use, and the brand colours. One per
 * project, edited by the customer (it is their brand, not platform spend).
 */
export interface AdStudioBrandKit {
  /** As it must appear in ads and as the advertiser name in previews. Empty: the ad's name is used. */
  brandName: string;
  /** In the customer's words, e.g. "warm, plain-spoken, a little playful; never pushy". */
  toneOfVoice: string;
  /** Words or phrases the copy must never use (competitor names, banned claims, jargon). */
  avoidWords: string[];
  /** Brand colours as #rrggbb, most important first. */
  colors: string[];
}

export const AD_STUDIO_BRAND_LIMITS = { brandName: 60, toneOfVoice: 400, avoidWords: 20, avoidWord: 40, colors: 5 } as const;

export const EMPTY_AD_STUDIO_BRAND_KIT: AdStudioBrandKit = { brandName: '', toneOfVoice: '', avoidWords: [], colors: [] };

const HEX = /^#[0-9a-f]{6}$/;

/** A brand kit from untrusted input: trimmed, de-duplicated, colours as lowercase #rrggbb. Null for a malformed shape. */
export function parseAdStudioBrandKit(raw: unknown): AdStudioBrandKit | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const text = (field: unknown) => (typeof field === 'string' ? field.trim() : '');
  const list = (field: unknown, normalize: (entry: string) => string = (entry) => entry) =>
    Array.isArray(field) ? [...new Set(field.filter((entry): entry is string => typeof entry === 'string').map((entry) => normalize(entry.trim())).filter(Boolean))] : [];
  return {
    brandName: text(value.brandName),
    toneOfVoice: text(value.toneOfVoice),
    avoidWords: list(value.avoidWords),
    colors: list(value.colors, (color) => color.toLowerCase()),
  };
}

/** Why a brand kit cannot be saved, as stable codes the UI translates; empty when it can. */
export function validateAdStudioBrandKit(kit: AdStudioBrandKit): string[] {
  const issues: string[] = [];
  if (kit.brandName.length > AD_STUDIO_BRAND_LIMITS.brandName) issues.push('brand_name_too_long');
  if (kit.toneOfVoice.length > AD_STUDIO_BRAND_LIMITS.toneOfVoice) issues.push('tone_too_long');
  if (kit.avoidWords.length > AD_STUDIO_BRAND_LIMITS.avoidWords) issues.push('too_many_avoid_words');
  if (kit.avoidWords.some((word) => word.length > AD_STUDIO_BRAND_LIMITS.avoidWord)) issues.push('avoid_word_too_long');
  if (kit.colors.length > AD_STUDIO_BRAND_LIMITS.colors) issues.push('too_many_colors');
  if (kit.colors.some((color) => !HEX.test(color))) issues.push('invalid_color');
  return issues;
}

export function isAdStudioBrandKitEmpty(kit: AdStudioBrandKit | null | undefined): boolean {
  return !kit || (!kit.brandName && !kit.toneOfVoice && kit.avoidWords.length === 0 && kit.colors.length === 0);
}

/** The prompt rules a brand kit adds to every text prompt (scripts, copy, ideas, search ads). */
export function brandKitRules(kit: AdStudioBrandKit | null | undefined): string[] {
  if (isAdStudioBrandKitEmpty(kit) || !kit) return [];
  return [
    kit.brandName ? `The brand is "${kit.brandName}": write its name exactly so, never translated or abbreviated.` : null,
    kit.toneOfVoice ? `The brand's tone of voice, as the brand describes it: ${kit.toneOfVoice}` : null,
    kit.avoidWords.length ? `Never use these words or phrases: ${kit.avoidWords.map((word) => `"${word}"`).join(', ')}.` : null,
    kit.colors.length ? `Brand colours, for pictures and footage: ${kit.colors.join(', ')}. Use them for accents, props or backgrounds where it looks natural.` : null,
  ].filter((rule): rule is string => rule !== null);
}

/** The line an image or video prompt gets from the brand colours; null without colours. */
export function brandColorsLine(kit: AdStudioBrandKit | null | undefined): string | null {
  return kit?.colors.length ? `Use the brand colours ${kit.colors.join(', ')} for accents, props or the background where it looks natural.` : null;
}
