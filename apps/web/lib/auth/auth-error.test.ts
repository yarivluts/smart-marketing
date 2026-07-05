import { describe, expect, it } from 'vitest';
import { authErrorMessageKey } from './auth-error';

describe('authErrorMessageKey', () => {
  it.each([
    ['auth/invalid-credential', 'invalidCredentialsError'],
    ['auth/invalid-email', 'invalidCredentialsError'],
    ['auth/user-not-found', 'invalidCredentialsError'],
    ['auth/wrong-password', 'invalidCredentialsError'],
    ['auth/email-already-in-use', 'emailInUseError'],
    ['auth/weak-password', 'weakPasswordError'],
  ])('maps Firebase code %s to %s', (code, key) => {
    expect(authErrorMessageKey({ code })).toBe(key);
  });

  it('falls back to the generic error for an unrecognized Firebase code', () => {
    expect(authErrorMessageKey({ code: 'auth/network-request-failed' })).toBe('genericError');
  });

  it('falls back to the generic error for a non-Firebase error shape', () => {
    expect(authErrorMessageKey(new Error('boom'))).toBe('genericError');
    expect(authErrorMessageKey('boom')).toBe('genericError');
    expect(authErrorMessageKey(null)).toBe('genericError');
    expect(authErrorMessageKey(undefined)).toBe('genericError');
  });
});
