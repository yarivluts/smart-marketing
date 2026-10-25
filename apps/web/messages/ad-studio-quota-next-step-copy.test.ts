import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Studio = { quotaExceeded: string; errorInvalidScript: string; images: { quotaExceeded: string } };

describe('Ad Studio daily-allowance messages say when it comes back and who can change it', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const a = lang.AdStudio as unknown as Studio;
    const tomorrow = name === 'en' ? /tomorrow/ : /מחר/;
    const admin = name === 'en' ? /project admin/ : /מנהל פרויקט/;

    it(`text and picture allowances name tomorrow and the admin (${name})`, () => {
      for (const text of [a.quotaExceeded, a.images.quotaExceeded]) {
        expect(text).toMatch(tomorrow);
        expect(text).toMatch(admin);
        expect(text).toContain('{used}');
        expect(text).toContain('{limit}');
      }
    });

    it(`the script message does not talk about rules (${name})`, () => {
      expect(a.errorInvalidScript).not.toMatch(name === 'en' ? /rule/i : /כללי/);
    });
  }
});
