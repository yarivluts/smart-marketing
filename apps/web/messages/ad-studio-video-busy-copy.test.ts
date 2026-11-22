import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Studio = { videoRequestErrors: Record<string, string> };

describe('"already making it" video errors say to wait and try again', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const errors = (lang.AdStudio as unknown as Studio).videoRequestErrors;
    it(`both busy messages say to wait, then try again (${name})`, () => {
      for (const key of ['already_generating', 'already_assembling']) {
        expect(errors[key]).toMatch(name === 'en' ? /Wait for it to finish, then try again\.$/ : /המתינו שיסתיים ונסו שוב\.$/);
      }
    });
  }

  it('the Hebrew clip message no longer reads as "a clip was already created"', () => {
    expect((he.AdStudio as unknown as Studio).videoRequestErrors.already_generating).not.toMatch(/כבר נוצר/);
  });
});
