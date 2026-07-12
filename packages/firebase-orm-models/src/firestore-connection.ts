import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { collection, connectFirestoreEmulator, getDocs, getFirestore } from 'firebase/firestore';
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
  const firestore = getFirestore(app);

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
