import { connectFirestoreOrmAdmin } from '@growthos/firebase-orm-models';

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
 * Always the Admin SDK, emulator included — this was the last place KAN-103
 * could still bite, and it was still biting: `mcp.controller.e2e.spec.ts` failed
 * with `RESOURCE_EXHAUSTED: Received message larger than max (704820226 vs
 * 4194304)`, which is a corrupted length prefix rather than a real 704MB
 * message, on a DOCUMENTATION-ONLY pull request.
 *
 * The flake is the client SDK's gRPC `Listen` stream losing its framing against
 * the emulator, after which every read of it is garbage. The mitigation that was
 * believed to cover this (`experimentalForceLongPolling`) is honoured only by the
 * client SDK's BROWSER build; in Node the transport is chosen unconditionally as
 * gRPC and the flag is never consulted.
 *
 * `packages/firebase-orm-models` moved off that path first, then `apps/web`,
 * whose Playwright runs boot a real Next server in Node. This service is simpler
 * than either: it runs entirely under Jest in Node with no jsdom case to
 * preserve, so there is no runtime branch to make — one path, and it is the one
 * production already uses via Application Default Credentials.
 *
 * The Admin SDK serves `get()` with `runQuery`/`batchGetDocuments` and opens a
 * `Listen` stream only for `onSnapshot`, which nothing here uses. No long-lived
 * stream means no framing to lose. Safe against the emulator because its rules
 * are open (`apps/api/firestore.rules`), so nothing depended on the client SDK
 * being subject to rules — and the e2e specs now exercise the same connection
 * production does rather than one that existed only for tests.
 */
export async function connectFirestoreOrmForApi(): Promise<void> {
  // The Admin SDK picks `FIRESTORE_EMULATOR_HOST` up from the environment
  // itself, so the emulator and production paths are the same call.
  const projectId = process.env.FIREBASE_PROJECT_ID ?? EMULATOR_PROJECT_ID;
  await connectFirestoreOrmAdmin({ projectId });
}
