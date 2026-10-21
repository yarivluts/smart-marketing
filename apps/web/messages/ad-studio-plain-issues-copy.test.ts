import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Ad Studio search-ad problems and saved-audience note use plain words', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const a = lang.AdStudio as unknown as Record<string, any>;

    it(`does not say "presets", "display path" or "a rule was broken" (${name})`, () => {
      const text = [a.audience.savedNote, ...Object.values(a.search.issues)].join('\n');
      const jargon =
        name === 'en'
          ? /preset|targeting|display path|match type|rule was broken/i
          : /הגדרות טירגוט|נתיב תצוגה|סוג התאמה|הופר אחד הכללים/;
      expect(text).not.toMatch(jargon);
    });

    it(`keeps the {index} placeholder where the problem points at an item (${name})`, () => {
      for (const key of ['invalid_match_type', 'duplicate_keyword', 'headline_too_long']) {
        expect(a.search.issues[key]).toContain('{index}');
      }
    });
  }
});
