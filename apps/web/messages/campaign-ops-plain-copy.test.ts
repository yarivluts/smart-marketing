import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'paybackHeading',
  'paybackWindowLabel',
  'calibrationUnavailable',
  'columnQualityTier',
  'columnPayingRate',
  'columnCollectedRevenue40d',
] as const;

describe('Ad payback page uses plain words', () => {
  it('has no marketing jargon in the headings, columns and empty state (English)', () => {
    for (const key of KEYS) {
      expect(en.CampaignOps[key], key).not.toMatch(/window|calibration|\btier\b|collect/i);
    }
  });

  it('has no Hebrew jargon (window, calibration, quality level, collection) in the same texts', () => {
    // Hebrew written as escapes so no Hebrew lives in code files.
    const jargon = new RegExp(
      ['\\u05d7\\u05dc\\u05d5\\u05df', '\\u05db\\u05d9\\u05d5\\u05dc', '\\u05e8\\u05de\\u05ea \\u05d0\\u05d9\\u05db\\u05d5\\u05ea', '\\u05d2\\u05d1\\u05d9\\u05d9\\u05d4', '\\u05e0\\u05d2\\u05d1\\u05d4'].join('|'),
    );
    for (const key of KEYS) {
      expect(he.CampaignOps[key], key).not.toMatch(jargon);
    }
  });

  it('keeps the day count placeholder in both languages', () => {
    expect(en.CampaignOps.paybackWindowLabel).toContain('{days}');
    expect(he.CampaignOps.paybackWindowLabel).toContain('{days}');
  });
});
