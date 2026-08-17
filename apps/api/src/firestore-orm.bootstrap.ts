import { connectFirestoreOrm, connectFirestoreOrmAdmin } from '@growthos/firebase-orm-models';

const EMULATOR_PROJECT_ID = 'demo-growthos-test';

/**
 * Connects the shared `@growthos/firebase-orm-models` ORM connection once at
 * process startup — every controller in this service (`hooks`, `ingest`,
 * `mcp`, ...) constructs a `BaseModel` subclass on the request path, which
 * throws `The global Firestore default is undefined!` if nothing has called
 * this first. `apps/web`'s equivalent (`lib/firebase/firestore.ts`) does
 * this lazily per-request since Next route handlers don't share a single
 * bootstrap entrypoint; this service does have one (`main.ts`), so connects
 * once before `app.listen()` instead.
 *
 * Same emulator-vs-admin branch as the web app: `FIRESTORE_EMULATOR_HOST`
 * set (how `firebase emulators:exec` wires `pnpm test`) keeps the
 * client-SDK path against the emulator; otherwise (real deployment, e.g.
 * Cloud Run) uses the Admin-SDK path via Application Default Credentials.
 */
export async function connectFirestoreOrmForApi(): Promise<void> {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? EMULATOR_PROJECT_ID;
  if (emulatorHost) {
    await connectFirestoreOrm({ projectId, emulatorHost });
  } else {
    await connectFirestoreOrmAdmin({ projectId });
  }
}
