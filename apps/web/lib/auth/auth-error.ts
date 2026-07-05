export type AuthErrorMessageKey =
  | 'invalidCredentialsError'
  | 'emailInUseError'
  | 'weakPasswordError'
  | 'genericError';

const CODE_TO_KEY: Record<string, AuthErrorMessageKey> = {
  'auth/invalid-credential': 'invalidCredentialsError',
  'auth/invalid-email': 'invalidCredentialsError',
  'auth/user-not-found': 'invalidCredentialsError',
  'auth/wrong-password': 'invalidCredentialsError',
  'auth/email-already-in-use': 'emailInUseError',
  'auth/weak-password': 'weakPasswordError',
};

function hasErrorCode(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string';
}

/** Maps a Firebase Auth (or session-sync) error to a translation key in the `Auth` namespace. */
export function authErrorMessageKey(error: unknown): AuthErrorMessageKey {
  if (hasErrorCode(error)) {
    return CODE_TO_KEY[error.code] ?? 'genericError';
  }
  return 'genericError';
}
