import { connectFirestoreOrm, receiveHookPayload } from '@growthos/firebase-orm-models';

const EMULATOR_PROJECT_ID = 'demo-growthos-test';

let connectionPromise: Promise<void> | undefined;

/** Standalone ORM connection bootstrap for Playwright spec files — see `seed-ingest.ts`'s doc comment for why this can't just import the app's own `server-only` module. */
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
 * Lands one raw delivery on a hook endpoint directly through
 * `receiveHookPayload` (KAN-53), standing in for a real `POST` to `apps/api`'s
 * `/v1/hooks/:hookId` — `apps/api` isn't part of this app's own e2e
 * `webServer`, the same posture `seedIngestFixture` already established for
 * the ingest API.
 */
export async function seedHookDelivery(params: { hookId: string; rawBody: string }): Promise<void> {
  await ensureConnected();
  const result = await receiveHookPayload({ hookId: params.hookId, rawBody: params.rawBody, headers: {} });
  if (!result.ok) {
    throw new Error(`seedHookDelivery: receiveHookPayload rejected the payload (${result.error})`);
  }
}
