import 'server-only';
import { connectFirestoreOrm, connectFirestoreOrmAdmin } from '@growthos/firebase-orm-models';

const EMULATOR_PROJECT_ID = 'demo-growthos-test';

let connectionPromise: Promise<void> | undefined;

/**
 * Lazily connects the shared `@growthos/firebase-orm-models` ORM connection
 * (idempotent — safe to call on every request).
 *
 * - With `FIRESTORE_EMULATOR_HOST` set (how `firebase emulators:exec` wires
 *   `pnpm test`), keeps the original client-SDK path against the emulator.
 * - Otherwise (real deployment, e.g. Cloud Run) uses the Admin-SDK path:
 *   server-side client-SDK access is unauthenticated, so Firestore security
 *   rules reject it (`permission-denied`), while Admin credentials come from
 *   Application Default Credentials and bypass rules, as trusted server code
 *   should.
 *
 * `server-only` guarded like `lib/firebase/admin.ts`, since this must never
 * end up in a client bundle.
 */
export function ensureFirestoreOrm(): Promise<void> {
  if (!connectionPromise) {
    const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
    const projectId = process.env.FIREBASE_PROJECT_ID ?? EMULATOR_PROJECT_ID;
    connectionPromise = emulatorHost
      ? connectFirestoreOrm({
          projectId,
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          emulatorHost,
        })
      : connectFirestoreOrmAdmin({ projectId });
  }
  return connectionPromise;
}
