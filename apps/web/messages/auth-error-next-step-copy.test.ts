import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('sign-in and sign-up errors point to the next step', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const auth = lang.Auth;
    const forgot = name === 'en' ? 'Forgot password?' : 'שכחת סיסמה?';

    it(`wrong password and existing email both mention the reset link (${name})`, () => {
      expect(auth.forgotPassword).toBe(forgot);
      expect(auth.invalidCredentialsError).toContain(forgot);
      expect(auth.emailInUseError).toContain(forgot);
      expect(auth.tooManyAttemptsError).toContain(forgot);
    });

    it(`the waiting button says what is happening, not "processing" (${name})`, () => {
      expect(auth).not.toHaveProperty('processing');
      expect(auth.signingIn).toMatch(name === 'en' ? /Signing you in/ : /מתחברים/);
      expect(auth.creatingAccount).toMatch(name === 'en' ? /Creating your account/ : /יוצרים את החשבון/);
    });

    it(`existing email tells the person to sign in instead (${name})`, () => {
      expect(auth.emailInUseError).toMatch(name === 'en' ? /Sign in instead/ : /התחברו/);
    });
  }
});
