import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'proposeDraftFinalUrlLabel',
  'proposeDraftNegativeKeywordsLabel',
  'proposeDraftAdSetNameLabel',
  'proposeDraftCountriesLabel',
  'proposeDraftImageLabel',
  'proposeDraftImagePreviewAlt',
] as const;

const HEBREW = /[֐-׿]/;
const JARGON_EN = /final url|negative keyword|ad set|\bISO\b|creative/i;
const JARGON_HE = /ISO|Ad Set|קריאייטיב|מילות מפתח שליליות|URL/;

describe('the campaign draft form speaks plain words', () => {
  it('English avoids ad-platform jargon', () => {
    for (const key of KEYS) expect(en.Automation[key], key).not.toMatch(JARGON_EN);
  });

  it('Hebrew is Hebrew and avoids jargon', () => {
    for (const key of KEYS) {
      expect(he.Automation[key], key).toMatch(HEBREW);
      expect(he.Automation[key], key).not.toMatch(JARGON_HE);
    }
  });
});
