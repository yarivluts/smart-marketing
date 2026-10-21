import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = Object.keys(en.Automation).filter(
  (k) =>
    !/Placeholder/.test(k) &&
    /^(proposeMetaAdSetEdit|proposeMetaAdSetTargetingEdit|proposeMetaAdCreativeEdit|diffFieldAdSet|diffFieldCreative|diffFieldPreviousCreative|diffFieldNewCreative)/.test(
      k,
    ),
) as (keyof typeof en.Automation)[];

const HEBREW = /[֐-׿]/;
const JARGON_EN = /ad set|creative|targeting/i;
const JARGON_HE = /קבוצת מודעות|קריאייטיב|Ad Set/;

describe('the ad edit proposal forms speak plain words', () => {
  it("finds the forms' keys", () => {
    expect(KEYS.length).toBeGreaterThanOrEqual(18);
  });

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
