import 'server-only';
import { connectFirestoreOrm } from '@growthos/firebase-orm-models';

const EMULATOR_PROJECT_ID = 'demo-growthos-test';

let connectionPromise: Promise<void> | undefined;

/**
 * Lazily connects the shared `@growthos/firebase-orm-models` ORM connection
 * (idempotent — safe to call on every request). Uses the Firestore emulator
 * when `FIRESTORE_EMULATOR_HOST` is set, matching how `firebase
 * emulators:exec` wires child processes for `pnpm test`; real credentials
 * are pending KAN-18. `server-only` guarded like `lib/firebase/admin.ts`,
 * since this must never end up in a client bundle.
 */
export function ensureFirestoreOrm(): Promise<void> {
  if (!connectionPromise) {
    connectionPromise = connectFirestoreOrm({
      projectId: process.env.FIREBASE_PROJECT_ID ?? EMULATOR_PROJECT_ID,
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      emulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
    });
  }
  return connectionPromise;
}
