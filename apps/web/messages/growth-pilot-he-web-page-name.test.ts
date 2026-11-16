import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// Hebrew is spelled with code points here: Hebrew stays out of code files.
const LANDING_WORD_HE = String.fromCodePoint(0x05E0, 0x05D7, 0x05D9, 0x05EA, 0x05D4);
const WEB_PAGE_HE = String.fromCodePoint(0x05D3, 0x05E3, 0x20, 0x05D0, 0x05D9, 0x05E0, 0x05D8, 0x05E8, 0x05E0, 0x05D8);
const THE_WEB_PAGE_HE = String.fromCodePoint(0x05D3, 0x05E3, 0x20, 0x05D4, 0x05D0, 0x05D9, 0x05E0, 0x05D8, 0x05E8, 0x05E0, 0x05D8);

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('Growth Pilot names the page the same way in every line', () => {
  it('Hebrew never says "landing page" anywhere in Growth Pilot', () => {
    for (const text of strings(he.GrowthPilot)) {
      expect(text).not.toContain(LANDING_WORD_HE);
    }
  });

  it('Hebrew says "web page" where English does', () => {
    const detail = he.GrowthPilot.detail;
    expect(detail.stages.landing).toBe(WEB_PAGE_HE);
    expect(detail.change.areaLabel.landing).toBe(WEB_PAGE_HE);
    expect(he.GrowthPilot.landing.explainChange).toContain(THE_WEB_PAGE_HE);
  });

  it('English never says "landing page" anywhere in Growth Pilot', () => {
    for (const text of strings(en.GrowthPilot)) expect(text).not.toMatch(/landing page/i);
  });
});
