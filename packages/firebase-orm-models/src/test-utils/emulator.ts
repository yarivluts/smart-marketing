import { connectFirestoreOrmAdmin } from '../firestore-connection';

/**
 * Connects the ORM's global Firestore connection to the local emulator started
 * by `firebase emulators:exec` (see this package's `test` script and
 * `firebase.json`). Must match the `--project` flag passed to that command.
 *
 * ## Why this uses the Admin SDK rather than the client SDK (KAN-103)
 *
 * This suite's long-running flake was the client SDK's gRPC `Listen` stream
 * getting its framing desynchronized against the emulator, after which every
 * subsequent read of that stream is garbage. The symptoms look unrelated but are
 * one failure: `RESOURCE_EXHAUSTED: Received message larger than max
 * (4036202791 vs 4194304)` is a garbage *length prefix* being read as a message
 * size — nothing here is 4GB — and alongside it come
 * `INTERNAL: Response message parsing error: invalid wire type 6 at offset 500`
 * and `index out of range: 28 + 10 > 28`, which are the same corrupted bytes
 * failing to parse a different way. Upstream: firebase-tools#8654.
 *
 * The previous mitigation was `experimentalForceLongPolling: true`, on the
 * theory that it swaps gRPC for HTTP long-polling so nothing accumulates on a
 * shared stream. **That option does nothing in Node.** The client SDK ships
 * separate builds, and in `index.node.cjs.js` the transport is chosen by
 * `function newConnection(databaseInfo) { return new GrpcConnection(protos,
 * databaseInfo); }` — unconditional, with `forceLongPolling` stored on the
 * database info and never consulted. It is honoured only by the browser build's
 * WebChannel transport.
 *
 * That is why the flake only ever failed `@growthos/firebase-orm-models#test`
 * and never apps/web's emulator suites: apps/web runs vitest with
 * `environment: 'jsdom'` and so resolves the browser build, where the setting is
 * real. This package runs `environment: 'node'`, where it was a no-op — so this
 * path has been unprotected the whole time it was believed fixed.
 *
 * The Admin SDK avoids the problem structurally rather than papering over it: it
 * serves `get()` with `runQuery`/`batchGetDocuments` RPCs and opens a `Listen`
 * stream only for `onSnapshot`, which nothing here uses. No long-lived stream
 * means no framing to lose. It is also the connection real deployments use, so
 * the tests now exercise the production path.
 *
 * Safe for this suite specifically because the emulator rules are open
 * (`allow read, write: if true` — see `firestore.rules`), so nothing here
 * depended on the client SDK being subject to rules.
 *
 * `appName` is accepted and ignored, kept so the ~75 calling test files did not
 * all have to change: the Admin SDK holds one process-wide connection rather
 * than a named app per file, and `connectFirestoreOrmAdmin` is idempotent.
 */
const EMULATOR_PROJECT_ID = 'demo-growthos-test';
const EMULATOR_HOST = '127.0.0.1:8080';

export async function connectToFirestoreEmulator(_appName: string): Promise<void> {
  // `firebase emulators:exec` sets this for us; defaulted so a direct `vitest
  // run` against an already-running emulator still reaches it rather than
  // silently trying to talk to production Firestore.
  process.env.FIRESTORE_EMULATOR_HOST ??= EMULATOR_HOST;

  await connectFirestoreOrmAdmin({
    projectId: process.env.FIREBASE_PROJECT_ID ?? EMULATOR_PROJECT_ID,
  });
}
