import { connectFirestoreOrm, receiveHookPayload } from '@growthos/firebase-orm-models';

const EMULATOR_PROJECT_ID = 'demo-growthos-test';

let connectionPromise: Promise<void> | undefined;

/** Standalone Firestore ORM connection bootstrap for Playwright spec files — see `seed-ingest.ts`'s own doc comment for why this can't just import the `server-only` real one. */
function ensureConnected(): Promise<void> {
  if (!connectionPromise) {
    connectionPromise = connectFirestoreOrm({
      projectId: process.env.FIREBASE_PROJECT_ID ?? EMULATOR_PROJECT_ID,
      emulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
    });
  }
  return connectionPromise;
}

/**
 * Lands one review-queue payload on a project's first hook endpoint (KAN-53) — there's no UI path
 * to actually POST to `/v1/hooks/{project}/{hook_id}` in this app's own e2e `webServer` (`apps/api`
 * isn't part of it, same reasoning as `seed-ingest.ts`'s `ingestBatch` call), so this calls
 * `receiveHookPayload` directly against the emulator the running `next dev` server is also using.
 */
export async function seedHookPayload(params: { organizationId: string; projectId: string; hookEndpointId: string }): Promise<void> {
  await ensureConnected();
  await receiveHookPayload({
    projectId: params.projectId,
    hookEndpointId: params.hookEndpointId,
    rawBody: '{"order_id":"e2e-1"}',
    headers: { 'content-type': 'application/json' },
  });
}
