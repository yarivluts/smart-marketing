import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const lines = (g: typeof en.GrowthPilot) => [g.audience.metaMissing, g.audience.metaFailed, g.performance.source];

describe('Growth Pilot audience and results notes use plain words', () => {
  it('en: no "campaigns", "reach" or "interests matched" jargon', () => {
    for (const text of lines(en.GrowthPilot)) {
      expect(text).not.toMatch(/campaign|\breach\b(?! )|interests are not matched/i);
    }
    expect(en.GrowthPilot.performance.source).toContain('the ads the pilot made');
  });

  it('he: says "ads", not "campaigns", and keeps the notes non-empty', () => {
    for (const text of lines(he.GrowthPilot as typeof en.GrowthPilot)) {
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toMatch(/קמפיין|תחומי העניין עוד לא הותאמו/);
    }
  });
});
