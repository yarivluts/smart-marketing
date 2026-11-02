import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Ad Studio usage tiles say what was done, not "AI text calls"', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const a = lang.AdStudio as unknown as Record<string, string>;

    it(`names the ad-text counters in plain words (${name})`, () => {
      for (const key of ['kpiTextToday', 'usageTodayText', 'dailyText']) {
        expect(a[key]).not.toMatch(name === 'en' ? /\bAI\b|calls/i : /AI|קריאות/);
      }
      expect(a.kpiTextToday).toBe(a.usageTodayText);
    });
  }
});
