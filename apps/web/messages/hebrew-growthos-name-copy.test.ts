import { describe, expect, it } from 'vitest';
import he from './he.json';

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

// Hebrew letters are written as escapes: Hebrew stays out of code files.
const HEBREW_LETTER_BEFORE_PRODUCT_NAME = /[\u05d0-\u05ea](GrowthOS|Growth Pilot)/;
const FEMININE_VERB_AFTER_GROWTHOS = /GrowthOS (\u05e2\u05e9\u05ea\u05d4|\u05d4\u05e6\u05dc\u05d9\u05d7\u05d4|\u05d9\u05db\u05d5\u05dc\u05d4)/;

describe('Hebrew copy writes the product name cleanly and in one gender', () => {
  const all = strings(he);

  it('joins a prefix letter to GrowthOS with a hyphen, never glued to the Latin letters', () => {
    expect(all.filter((s) => HEBREW_LETTER_BEFORE_PRODUCT_NAME.test(s))).toEqual([]);
  });

  it('uses the masculine verb after GrowthOS, like "GrowthOS did not manage" elsewhere', () => {
    expect(all.filter((s) => FEMININE_VERB_AFTER_GROWTHOS.test(s))).toEqual([]);
  });

  it('fixes the ad details source note', () => {
    const note = (he as { Campaigns: { stateSourceNote: string } }).Campaigns.stateSourceNote;
    expect(note).toContain('GrowthOS \u05e2\u05e9\u05d4');
  });
});
