import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Ad Studio "who sees the ad" problems use plain words', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const issues = (lang.AdStudio as unknown as Record<string, any>).audience.issues as Record<string, string>;

    it(`does not say "audiences" or "Meta" (${name})`, () => {
      const text = Object.values(issues).join('\n');
      expect(text).not.toMatch(name === 'en' ? /audience|\bMeta\b/i : /קהל|קהלים|מטא/);
    });

    it(`tells the person what to pick or change (${name})`, () => {
      expect(issues.invalid_audience).toMatch(name === 'en' ? /pick it from the list/ : /בחרו מהרשימה/);
      expect(issues.invalid_age).not.toMatch(/not above to/);
    });
  }
});
