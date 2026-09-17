import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  collection,
  connectFirestoreEmulator,
  getDocs,
  getFirestore,
  initializeFirestore,
} from 'firebase/firestore';
import { FirestoreOrmRepository } from '@arbel/firebase-orm';

// Both admin subpaths below are exports-map-only, invisible to this package's
// Node10 TS resolution — the imports type-check against local stubs mapped in
// tsconfig `paths` (see src/types/*.d.ts), while the emitted literal
// `require(...)` calls resolve through the real `exports` maps at runtime AND
// stay visible to Next's standalone file tracer (a non-literal dynamic import
// here previously left firebase-admin out of the deployed image entirely).
import { initializeAdminApp } from '@arbel/firebase-orm/admin';
import { getApps as getAdminApps, initializeApp as initializeAdminSdkApp } from 'firebase-admin/app';

const DEFAULT_APP_NAME = 'growthos-firestore-orm';
const WARMUP_ATTEMPTS = 20;
const WARMUP_RETRY_DELAY_MS = 500;

export interface FirestoreConnectionOptions {
  /** Firebase/Firestore project id. */
  projectId: string;
  apiKey?: string;
  /** Distinct Firebase app name, in case a caller needs more than one connection. */
  appName?: string;
  /** `"host:port"` — connects to the Firestore emulator instead of production when set. */
  emulatorHost?: string;
}

let connected = false;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function warmUpEmulatorConnection(firestore: ReturnType<typeof getFirestore>): Promise<void> {
  // Mirrors `test-utils/emulator.ts`'s warm-up retry: the emulator's gRPC
  // listener can still be settling right after it reports ready, which
  // intermittently surfaces as a bogus RESOURCE_EXHAUSTED error on the first
  // request. Retrying here means that transient failure lands during
  // connection setup instead of randomly failing whichever caller queries first.
  for (let attempt = 1; attempt <= WARMUP_ATTEMPTS; attempt++) {
    try {
      await getDocs(collection(firestore, 'connection_warmup_probe'));
      return;
    } catch (error) {
      if (attempt === WARMUP_ATTEMPTS) throw error;
      await delay(WARMUP_RETRY_DELAY_MS);
    }
  }
}

/**
 * Connects the global ORM connection through the Firebase **Admin** SDK —
 * the correct path for trusted server environments (Cloud Run, functions)
 * against a real Firestore project: credentials come from Application
 * Default Credentials and bypass security rules, whereas the client-SDK
 * path below is unauthenticated server-side and gets `permission-denied`
 * outside the emulator. The Admin SDK honours `FIRESTORE_EMULATOR_HOST` on
 * its own, so this path works against the emulator too. Idempotent, same as
 * `connectFirestoreOrm`.
 */
export async function connectFirestoreOrmAdmin(options: { projectId: string }): Promise<void> {
  if (connected) {
    return;
  }

  const adminApp =
    getAdminApps()[0] ?? initializeAdminSdkApp({ projectId: options.projectId });
  await initializeAdminApp(adminApp);

  connected = true;
}

/**
 * Connects `@growthos/firebase-orm-models`' global ORM connection to
 * Firestore. This is the only place in the codebase that touches the raw
 * `firebase/app`/`firebase/firestore` client SDK directly, so that consumers
 * (e.g. `apps/web`) never need to depend on `@arbel/firebase-orm` or the
 * Firebase SDK themselves — they go through this package only, per CLAUDE.md.
 * Idempotent: safe to call on every request once a connection is established.
 */
export async function connectFirestoreOrm(options: FirestoreConnectionOptions): Promise<void> {
  if (connected) {
    return;
  }

  const appName = options.appName ?? DEFAULT_APP_NAME;
  const existingApp = getApps().find((app) => app.name === appName);
  const app: FirebaseApp =
    existingApp ??
    initializeApp({ apiKey: options.apiKey ?? 'demo-api-key', projectId: options.projectId }, appName);

  /*
    Against the emulator, ask for the long-polling transport.

    READ THIS BEFORE RELYING ON IT: `experimentalForceLongPolling` is honoured ONLY by the
    client SDK's browser build, whose WebChannel transport implements it. In the Node build
    (`@firebase/firestore/dist/index.node.cjs.js`) the transport is chosen by
    `function newConnection(databaseInfo) { return new GrpcConnection(protos, databaseInfo); }`
    — unconditional, with `forceLongPolling` stored on the database info and never consulted.
    So this line is a no-op under `vitest --environment node` or Jest, and load-bearing only
    where the browser build is resolved (apps/web's suites run `environment: 'jsdom'`).

    It is kept because that jsdom case is real, not because it protects every caller. What it
    does NOT do is prevent KAN-103: the emulator's gRPC `Listen` stream losing its framing,
    after which reads come back as `RESOURCE_EXHAUSTED: Received message larger than max
    (4036202791 vs 4194304)` — a garbage length prefix, not a real 4GB message — or as
    `INTERNAL: Response message parsing error: invalid wire type 6 at offset 500`. This comment
    previously asserted the opposite, which is why the flake outlived several attempts to fix
    it. `packages/firebase-orm-models`' own emulator suite now sidesteps the whole class by
    connecting through the Admin SDK instead (see `test-utils/emulator.ts`); apps/api's e2e
    specs still reach the emulator through this client path under Node and remain exposed.

    Production keeps gRPC regardless: it is the faster transport, and the corruption is
    specific to many short-lived test connections against one shared emulator.
  */
  const firestore = options.emulatorHost
    ? initializeFirestore(app, { experimentalForceLongPolling: true })
    : getFirestore(app);

  if (options.emulatorHost) {
    const [host, portString] = options.emulatorHost.split(':');
    connectFirestoreEmulator(firestore, host, Number(portString));
  }

  await FirestoreOrmRepository.initGlobalConnection(firestore);

  if (options.emulatorHost) {
    await warmUpEmulatorConnection(firestore);
  }

  connected = true;
}
