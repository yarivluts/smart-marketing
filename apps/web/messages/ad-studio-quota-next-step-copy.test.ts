import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Studio = { quotaExceeded: string; videoQuotaExceeded: string; errorInvalidScript: string; images: { quotaExceeded: string } };

describe('Ad Studio daily-allowance messages say when it comes back and where limits come from', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const a = lang.AdStudio as unknown as Studio;
    const tomorrow = name === 'en' ? /tomorrow/ : /מחר/;
    const plan = name === 'en' ? /GrowthOS plan/ : /התוכנית שלכם/;
    const oldAdmin = name === 'en' ? /admin|studio settings/i : /מנהל פרויקט|הגדרות הסטודיו/;

    it(`text and picture allowances name tomorrow and the plan, not a self-service raise (${name})`, () => {
      for (const text of [a.quotaExceeded, a.videoQuotaExceeded, a.images.quotaExceeded]) {
        expect(text).toMatch(tomorrow);
        expect(text).toMatch(plan);
        expect(text).not.toMatch(oldAdmin);
        expect(text).toContain('{used}');
        expect(text).toContain('{limit}');
      }
    });

    it(`the script message does not talk about rules (${name})`, () => {
      expect(a.errorInvalidScript).not.toMatch(name === 'en' ? /rule/i : /כללי/);
    });
  }
});
