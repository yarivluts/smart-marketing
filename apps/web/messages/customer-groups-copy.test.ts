import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// The menu and page title say "Customer groups"; buttons and messages must use the same name.
describe('Customer groups copy', () => {
  for (const [lang, messages] of [['en', en], ['he', he]] as const) {
    it(`${lang}: no visible line on the page still says segment`, () => {
      const block = messages.Segments as Record<string, unknown>;
      const offenders = Object.entries(block)
        .filter(([, v]) => typeof v === 'string')
        .filter(([, v]) => /segment|פלח/i.test(v as string))
        .map(([key]) => key);
      expect(offenders).toEqual([]);
    });
  }
});
