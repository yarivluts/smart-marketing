import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const HEBREW = /[֐-׿]/;
const JARGON_EN = /match type|\bbroad\b|\bphrase\b|\bexact\b/i;
const JARGON_HE = /סוג התאמה|רחבה|ביטוי|מדויקת/;

describe('the keyword match choice speaks plain words', () => {
  for (const [name, search, jargon] of [
    ['en', en.AdStudio.search, JARGON_EN],
    ['he', he.AdStudio.search, JARGON_HE],
  ] as const) {
    it(`${name}: no match-type jargon in the label, options or hint`, () => {
      const texts = [
        search.matchTypeLabel,
        search.matchTypesHint,
        ...Object.values(search.matchTypes),
      ];
      for (const text of texts) expect(text).not.toMatch(jargon);
    });
  }

  it('keeps all three options and the keyword placeholder, in Hebrew too', () => {
    for (const search of [en.AdStudio.search, he.AdStudio.search]) {
      expect(Object.keys(search.matchTypes).sort()).toEqual(['BROAD', 'EXACT', 'PHRASE']);
      expect(search.matchTypeLabel).toContain('{keyword}');
    }
    for (const text of Object.values(he.AdStudio.search.matchTypes)) expect(text).toMatch(HEBREW);
  });
});
