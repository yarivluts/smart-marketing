import { connectFirestoreOrm, findUserByEmail, registerSchemaDefinition, setProjectFunnel } from '@growthos/firebase-orm-models';

const EMULATOR_PROJECT_ID = 'demo-growthos-test';

let connectionPromise: Promise<void> | undefined;

/** Same standalone ORM bootstrap `seed-ingest.ts` documents: Playwright specs run in plain Node, outside Next's bundler. */
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
 * Registers one event schema per name and sets them as the project's funnel through
 * `setProjectFunnel` - the exact service the MCP `set_funnel` tool calls (KAN-199). `apps/api`
 * is not part of this app's own e2e `webServer`, so this stands in for an agent calling the tool,
 * writing through the same code path rather than a hand-built document.
 */
export async function seedFunnelSetOverMcp(params: {
  organizationId: string;
  projectId: string;
  ownerEmail: string;
  eventSchemaNames: readonly string[];
}): Promise<void> {
  await ensureConnected();

  const owner = await findUserByEmail(params.ownerEmail);
  if (!owner) {
    throw new Error(`seedFunnelSetOverMcp: no user found for email ${params.ownerEmail}`);
  }

  for (const name of params.eventSchemaNames) {
    await registerSchemaDefinition({
      organizationId: params.organizationId,
      projectId: params.projectId,
      kind: 'event',
      name,
      fields: [{ name: 'plan', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });
  }

  await setProjectFunnel({
    organizationId: params.organizationId,
    projectId: params.projectId,
    actorType: 'api_key',
    actorId: 'e2e-mcp-key',
    steps: params.eventSchemaNames.map((eventSchemaName) => ({ eventSchemaName })),
  });
}
