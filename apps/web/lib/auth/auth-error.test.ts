import { describe, expect, it } from 'vitest';
import enMessages from '../../messages/en.json';
import heMessages from '../../messages/he.json';
import { authErrorMessageKey, isAuthCancelled } from './auth-error';

describe('authErrorMessageKey', () => {
  it.each([
    ['auth/invalid-credential', 'invalidCredentialsError'],
    ['auth/invalid-email', 'invalidCredentialsError'],
    ['auth/user-not-found', 'invalidCredentialsError'],
    ['auth/wrong-password', 'invalidCredentialsError'],
    ['auth/email-already-in-use', 'emailInUseError'],
    ['auth/weak-password', 'weakPasswordError'],
    ['auth/too-many-requests', 'tooManyAttemptsError'],
    ['auth/network-request-failed', 'networkError'],
    ['auth/popup-blocked', 'popupBlockedError'],
    ['auth/account-exists-with-different-credential', 'accountExistsOtherMethodError'],
    ['auth/user-disabled', 'accountDisabledError'],
    ['auth/invalid-custom-token', 'invalidOrExpiredTokenError'],
    ['auth/custom-token-mismatch', 'invalidOrExpiredTokenError'],
  ])('maps Firebase code %s to %s', (code, key) => {
    expect(authErrorMessageKey({ code })).toBe(key);
  });

  it('falls back to the generic error for an unrecognized Firebase code', () => {
    expect(authErrorMessageKey({ code: 'auth/internal-error' })).toBe('genericError');
  });

  it('falls back to the generic error for a non-Firebase error shape', () => {
    expect(authErrorMessageKey(new Error('boom'))).toBe('genericError');
    expect(authErrorMessageKey('boom')).toBe('genericError');
    expect(authErrorMessageKey(null)).toBe('genericError');
    expect(authErrorMessageKey(undefined)).toBe('genericError');
  });
});

describe('isAuthCancelled', () => {
  it('is true when the person closed the Google window', () => {
    expect(isAuthCancelled({ code: 'auth/popup-closed-by-user' })).toBe(true);
    expect(isAuthCancelled({ code: 'auth/cancelled-popup-request' })).toBe(true);
  });
  it('is false for real failures', () => {
    expect(isAuthCancelled({ code: 'auth/network-request-failed' })).toBe(false);
    expect(isAuthCancelled(new Error('boom'))).toBe(false);
  });
});

describe('auth error copy', () => {
  it('has English and Hebrew text for the new sign-in failures', () => {
    for (const key of ['accountExistsOtherMethodError', 'accountDisabledError'] as const) {
      expect(enMessages.Auth[key]).toBeTruthy();
      expect(heMessages.Auth[key]).toBeTruthy();
    }
  });
});
