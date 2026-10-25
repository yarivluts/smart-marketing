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
    });

    it(`existing email tells the person to sign in instead (${name})`, () => {
      expect(auth.emailInUseError).toMatch(name === 'en' ? /Sign in instead/ : /התחברו/);
    });
  }
});
