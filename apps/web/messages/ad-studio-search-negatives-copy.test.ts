import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Ad Studio search ad explains "words to never show for" in plain words', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const ad = (lang.AdStudio as unknown as Record<string, any>).publish ?? {};
    const search = (lang.AdStudio as unknown as Record<string, any>).search ?? {};
    const texts = [
      JSON.stringify(ad.searchNote ?? ''),
      JSON.stringify(search.negativesLabel ?? ''),
      JSON.stringify(search.issues?.too_many_negatives ?? ''),
    ];

    it(`does not use the term "negative keywords" (${name})`, () => {
      expect(texts.join('\n')).not.toMatch(name === 'en' ? /negative keyword/i : /שליליות/);
    });

    it(`has the three strings (${name})`, () => {
      expect(texts.every((t) => t.length > 2)).toBe(true);
    });
  }
});
