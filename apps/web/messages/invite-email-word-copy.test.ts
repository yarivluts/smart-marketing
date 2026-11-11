import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('the invite page uses the same word for email as sign-up', () => {
  it('Hebrew says אימייל (as in sign-up), not the formal דוא"ל, and says what to do next', () => {
    const line = he.Invite.verifyEmailError;
    expect(line).toContain('אימייל');
    expect(line).not.toMatch(/דוא"ל|דואר/);
    expect(line).toContain('אשרו שוב');
  });

  it('English tells the person to open the link, then accept again', () => {
    expect(en.Invite.verifyEmailError).toContain('accept the invite again');
  });
});
