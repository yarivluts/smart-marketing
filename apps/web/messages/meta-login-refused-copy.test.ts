import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Connect = { errors: { exchange_failed: string } };

describe('Facebook login refused: a next step a newcomer can take, not "check the app settings"', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    it(`points to support and avoids app-settings talk (${name})`, () => {
      const text = (lang.MetaConnect as unknown as Connect).errors.exchange_failed;
      expect(text).toMatch(/GrowthOS/);
      expect(text).not.toMatch(name === 'en' ? /app settings/i : /\u05d4\u05d2\u05d3\u05e8\u05d5\u05ea \u05d4\u05d0\u05e4\u05dc\u05d9\u05e7\u05e6\u05d9\u05d4/);
    });
  }
});
