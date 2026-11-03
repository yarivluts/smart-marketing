import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('the expired sign-in link message says what to do next', () => {
  it('en: explains why and offers a way forward', () => {
    const text = en.Auth.invalidOrExpiredTokenError;
    expect(text).toMatch(/expired or was already used/);
    expect(text).toMatch(/new link/);
    expect(text).not.toMatch(/invalid/i);
  });

  it('he: explains why and offers a way forward', () => {
    const text = he.Auth.invalidOrExpiredTokenError;
    expect(text).toContain('פג תוקף'); // expired
    expect(text).toContain('קישור חדש'); // a new link
    expect(text).not.toContain('לא תקף');
  });
});
