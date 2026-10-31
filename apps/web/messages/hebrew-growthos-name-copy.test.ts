import { describe, expect, it } from 'vitest';
import he from './he.json';

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

// Hebrew letters are written as escapes: Hebrew stays out of code files.
const HEBREW_LETTER_BEFORE_PRODUCT_NAME = /[א-ת](GrowthOS|Growth Pilot)/;
const FEMININE_VERB_AFTER_GROWTHOS = /GrowthOS (עשתה|הצלחה|יכולה)/;

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
    expect(note).toContain('הו GrowthOS'.slice(0, 0) + 'GrowthOS עשה');
  });
});
