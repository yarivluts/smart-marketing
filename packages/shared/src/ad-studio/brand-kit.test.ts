import { describe, expect, it } from 'vitest';
import { brandColorsLine, brandKitRules, isAdStudioBrandKitEmpty, parseAdStudioBrandKit, validateAdStudioBrandKit, EMPTY_AD_STUDIO_BRAND_KIT } from './brand-kit';

describe('brand kit', () => {
  it('cleans untrusted input: trims, de-duplicates and lowercases colours', () => {
    expect(
      parseAdStudioBrandKit({ brandName: ' EasySign ', slogan: ' Sign anywhere ', toneOfVoice: ' warm ', avoidWords: ['cheap', ' cheap', '', 3], colors: ['#5B4FE9', '#5b4fe9'] }),
    ).toEqual({
      brandName: 'EasySign',
      slogan: 'Sign anywhere',
      toneOfVoice: 'warm',
      avoidWords: ['cheap'],
      colors: ['#5b4fe9'],
    });
    expect(parseAdStudioBrandKit({ brandName: 'EasySign' })?.slogan).toBe('');
    expect(parseAdStudioBrandKit('nope')).toBeNull();
  });

  it('refuses what does not fit, as codes', () => {
    expect(validateAdStudioBrandKit({ ...EMPTY_AD_STUDIO_BRAND_KIT, colors: ['blue'] })).toEqual(['invalid_color']);
    expect(validateAdStudioBrandKit({ ...EMPTY_AD_STUDIO_BRAND_KIT, brandName: 'x'.repeat(61), avoidWords: Array.from({ length: 21 }, (_, i) => `w${i}`) })).toEqual([
      'brand_name_too_long',
      'too_many_avoid_words',
    ]);
    expect(validateAdStudioBrandKit({ ...EMPTY_AD_STUDIO_BRAND_KIT, slogan: 'x'.repeat(71) })).toEqual(['slogan_too_long']);
    expect(validateAdStudioBrandKit({ brandName: 'EasySign', slogan: 'Sign anywhere', toneOfVoice: 'warm', avoidWords: ['cheap'], colors: ['#5b4fe9'] })).toEqual([]);
  });

  it('adds prompt rules only for what is set', () => {
    expect(isAdStudioBrandKitEmpty(EMPTY_AD_STUDIO_BRAND_KIT)).toBe(true);
    expect(isAdStudioBrandKitEmpty({ ...EMPTY_AD_STUDIO_BRAND_KIT, slogan: 'Sign anywhere' })).toBe(false);
    expect(brandKitRules(null)).toEqual([]);
    const rules = brandKitRules({ brandName: 'EasySign', slogan: '', toneOfVoice: 'warm, never pushy', avoidWords: ['cheap', 'DocuSign'], colors: [] });
    expect(rules).toEqual([
      'The brand is "EasySign": write its name exactly so, never translated or abbreviated.',
      "The brand's tone of voice, as the brand describes it: warm, never pushy",
      'Never use these words or phrases: "cheap", "DocuSign".',
    ]);
    expect(brandKitRules({ ...EMPTY_AD_STUDIO_BRAND_KIT, slogan: 'Sign anywhere' })[0]).toContain('"Sign anywhere"');
    expect(brandColorsLine({ ...EMPTY_AD_STUDIO_BRAND_KIT, colors: ['#5b4fe9'] })).toContain('#5b4fe9');
    expect(brandColorsLine(EMPTY_AD_STUDIO_BRAND_KIT)).toBeNull();
  });
});
