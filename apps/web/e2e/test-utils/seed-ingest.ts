import {
  connectFirestoreOrm,
  findUserByEmail,
  ingestBatch,
  listEnvironmentsForProject,
  registerSchemaDefinition,
} from '@growthos/firebase-orm-models';

const EMULATOR_PROJECT_ID = 'demo-growthos-test';

let connectionPromise: Promise<void> | undefined;

/**
 * A standalone copy of `lib/firebase/firestore.ts`'s ORM connection bootstrap
 * for use from Playwright spec files, which run in plain Node rather than
 * through Next's bundler — same reasoning as `admin-auth.ts`'s own
 * standalone Firebase Auth bootstrap (the real module is `server-only`
 * guarded). Connects to the same Firestore emulator instance the `next dev`
 * server under test is using (`FIRESTORE_EMULATOR_HOST`, set by `firebase
 * emulators:exec` for every child process, including this one).
 */
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
 * Seeds one project with a registered `order_completed` event schema and one
 * ingest batch mixing accepted, quarantined, and duplicate records — enough
 * fixture data for the ingest-health page (KAN-35) to render a non-empty
 * rollup and quarantine browser without needing a real `apps/api` HTTP call
 * (there's no UI path to ingest data directly; `apps/api` isn't part of this
 * app's own e2e `webServer`).
 *
 * Looks the owner up by email (`findUserByEmail`) rather than
 * `ensureUserForFirebaseSession` — the owner already exists (the real sign-up
 * flow created their `UserModel` row), and `ensureUserForFirebaseSession`
 * would overwrite that row's real `firebaseUid` with a throwaway one made up
 * here, breaking the still-live browser session driving the rest of the test.
 */
export async function seedIngestFixture(params: {
  organizationId: string;
  projectId: string;
  ownerEmail: string;
}): Promise<void> {
  await ensureConnected();

  const owner = await findUserByEmail(params.ownerEmail);
  if (!owner) {
    throw new Error(`seedIngestFixture: no user found for email ${params.ownerEmail}`);
  }

  await registerSchemaDefinition({
    organizationId: params.organizationId,
    projectId: params.projectId,
    kind: 'event',
    name: 'order_completed',
    fields: [{ name: 'amount', type: 'number', isRequired: true, isPii: false, isIdentityKey: false }],
    createdByUserId: owner.id,
  });

  const environments = await listEnvironmentsForProject(params.organizationId, params.projectId);
  const prodEnvironment = environments.find((environment) => environment.name === 'prod')!;

  await ingestBatch({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: prodEnvironment.id,
    input: {
      kind: 'event',
      records: [
        { event_id: 'ord-1', event: 'order_completed', ts: '2026-07-06T10:00:00Z', properties: { amount: 42 } },
        { event_id: 'ord-2', event: 'order_completed', ts: '2026-07-06T10:01:00Z', properties: { amount: 18 } },
        { event_id: 'ord-1', event: 'order_completed', ts: '2026-07-06T10:02:00Z', properties: { amount: 42 } },
        { event_id: 'ord-3', event: 'order_completed', ts: '2026-07-06T10:03:00Z', properties: {} },
      ],
    },
  });
}
