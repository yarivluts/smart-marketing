import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Ad Studio keyword step avoids auction jargon', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const search = (lang.AdStudio as unknown as Record<string, any>).search;

    it(`does not talk about bidding or cost per click (${name})`, () => {
      const text = `${search.keywordsDescription}\n${search.selectedTitle}`;
      expect(text).not.toMatch(name === 'en' ? /\bbids?\b|cost per click|show first/i : /תתמודד|עלות הטיפוסית לקליק|להופיע ראשונים/);
    });

    it(`keeps the count placeholder in the title (${name})`, () => {
      expect(search.selectedTitle).toContain('{count}');
    });
  }
});
