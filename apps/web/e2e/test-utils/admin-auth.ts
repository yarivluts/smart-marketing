import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const EMULATOR_PROJECT_ID = 'demo-growthos-test';

/**
 * A standalone copy of `lib/firebase/admin.ts`'s app bootstrap for use from
 * Playwright spec files, which run in plain Node rather than through Next's
 * bundler — the real module starts with `import 'server-only'`, which always
 * throws when required outside that bundler (it relies on Next stripping it
 * from the server build, not on any runtime environment check).
 */
function getAdminApp() {
  return (
    getApps()[0] ?? initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? EMULATOR_PROJECT_ID })
  );
}

/**
 * Marks a user's email verified via the Admin SDK, standing in for "the
 * invitee clicked the verification link" Firebase itself would normally
 * require (see `sendEmailVerification` in `lib/auth/auth-context.tsx` and
 * `EmailNotVerifiedError` in `@growthos/firebase-orm-models`).
 */
export async function markEmailVerified(email: string): Promise<void> {
  const auth = getAuth(getAdminApp());
  const user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { emailVerified: true });
}
