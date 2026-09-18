import 'server-only';
import { connectFirestoreOrm, connectFirestoreOrmAdmin } from '@growthos/firebase-orm-models';
import { assertEmulatorReachable } from '@/lib/firebase/emulator-probe';

const EMULATOR_PROJECT_ID = 'demo-growthos-test';

let connectionPromise: Promise<void> | undefined;

/**
 * Lazily connects the shared `@growthos/firebase-orm-models` ORM connection
 * (idempotent — safe to call on every request).
 *
 * Production always takes the Admin-SDK path —
 * server-side client-SDK access is unauthenticated, so Firestore security rules
 * reject it (`permission-denied`), while Admin credentials come from Application
 * Default Credentials and bypass rules, as trusted server code should.
 *
 * Against the emulator the transport follows the runtime, which is the last
 * place KAN-103 could still bite. The flake is the client SDK's gRPC `Listen`
 * stream losing its framing against the emulator, after which every read of it is
 * garbage — surfacing as `RESOURCE_EXHAUSTED: Received message larger than max
 * (462029080 vs 4194304)`, which is a corrupted length prefix rather than a real
 * message size.
 *
 * Real Node gets the Admin SDK, which serves `get()` with
 * `runQuery`/`batchGetDocuments` and opens a `Listen` stream only for
 * `onSnapshot` — nothing here uses one, so there is no long-lived stream whose
 * framing can be lost.
 *
 * This comment used to claim that the app's unit tests "were never exposed
 * because vitest runs them with `environment: 'jsdom'`, which resolves the
 * client SDK's browser build where `experimentalForceLongPolling` is real".
 * **That was false** (KAN-165). jsdom supplies DOM globals and does not change
 * module resolution conditions: `require.resolve('firebase/firestore')` under
 * vitest returns `dist/index.cjs.js`, the gRPC build, where that option is read
 * and never consulted. So every emulator-backed test in this app took the
 * client branch below, on the unprotected transport, for as long as it was
 * believed protected — surfacing eventually as a 120s timeout with the
 * corrupted-stream signature on a PR that touched only a workflow file.
 *
 * The fix was the test environment, not this branch: `app/api/**` and
 * `lib/orgs/**` now run under `node` (see `vitest.config.ts`), so they reach
 * the Admin path and exercise the connection production uses. The branch stays
 * because the other half of the old claim is true and load-bearing — the ORM's
 * `initializeAdminApp` does refuse under a browser global, so a jsdom-hosted
 * caller has no Admin option. Note that `firebase-admin`'s own `initializeApp`
 * initializes fine under jsdom; probing that one instead is how you conclude
 * this branch is removable when it is not.
 *
 * Safe against the emulator because its rules are open
 * (`apps/web/firestore.rules`), so nothing depended on the client SDK being
 * subject to rules — and it makes the Playwright runs exercise the same
 * connection production uses.
 *
 * `server-only` guarded like `lib/firebase/admin.ts`, since this must never end
 * up in a client bundle.
 */
export function ensureFirestoreOrm(): Promise<void> {
  if (!connectionPromise) {
    const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
    const projectId = process.env.FIREBASE_PROJECT_ID ?? EMULATOR_PROJECT_ID;
    // The probe stays: an absent emulator otherwise surfaces as SDK retry
    // backoff that reports nothing for minutes and then fails on unrelated
    // assertions. See `assertEmulatorReachable`'s own doc comment (KAN-115).
    // The Admin SDK picks `FIRESTORE_EMULATOR_HOST` up from the environment
    // itself, so the connect call is identical either way.
    connectionPromise = emulatorHost
      ? assertEmulatorReachable(emulatorHost).then(() =>
          // Transport follows the RUNTIME, because that is what decides which
          // client-SDK build is in play. Under vitest's jsdom environment the
          // browser build is resolved, `experimentalForceLongPolling` is real,
          // and the client path is safe — and the Admin SDK is not even an
          // option there, since `initializeAdminApp` refuses to run when it sees
          // a browser global. Under real Node (the Next server Playwright boots)
          // the gRPC build is resolved, long-polling is a silent no-op, and the
          // Listen stream is exactly what corrupts.
          typeof window === 'undefined'
            ? connectFirestoreOrmAdmin({ projectId })
            : connectFirestoreOrm({ projectId, apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, emulatorHost }),
        )
      : connectFirestoreOrmAdmin({ projectId });
  }
  return connectionPromise;
}
