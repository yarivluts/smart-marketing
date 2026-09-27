import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  connectFirestoreOrmAdmin,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  generateLocalKmsKeyRing,
  mintApiKey,
  registerSchemaDefinition,
  requestBackfill,
  setBackfillEndpoint,
  signStandardWebhook,
  type BackfillDeliveryRequest,
} from '@growthos/firebase-orm-models';
import { AppModule } from '../app.module';

// Pass-through wrappers: the tools run the real services, but a test can swap in an in-memory
// transport (no real outbound call) and a public-address resolver for the next call.
jest.mock('@growthos/firebase-orm-models', () => {
  const actual = jest.requireActual('@growthos/firebase-orm-models');
  return {
    ...actual,
    requestBackfill: jest.fn((...args: unknown[]) => actual.requestBackfill(...args)),
    setBackfillEndpoint: jest.fn((...args: unknown[]) => actual.setBackfillEndpoint(...args)),
  };
});
const actual = jest.requireActual<typeof import('@growthos/firebase-orm-models')>('@growthos/firebase-orm-models');
const mockedRequestBackfill = requestBackfill as jest.MockedFunction<typeof requestBackfill>;
const mockedSetBackfillEndpoint = setBackfillEndpoint as jest.MockedFunction<typeof setBackfillEndpoint>;
const publicResolver = async () => ['203.0.113.10'];

/** The backfill loop end to end over the real HTTP surfaces: MCP tools, tagged ingest, and the completion endpoint. */

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8100';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
  process.env.GROWTHOS_VAULT_KEYS = JSON.stringify({ currentKeyId, keys: { [currentKeyId]: keyRing[currentKeyId].toString('base64') } });
  await connectFirestoreOrmAdmin({ projectId: 'demo-growthos-test' });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1');
  await app.init();
  await app.listen(0);
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});

afterAll(async () => {
  await app.close();
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function setup(name: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'App' });
  const dev = environments.find((environment) => environment.name === 'dev')!;
  const prod = environments.find((environment) => environment.name === 'prod')!;
  await registerSchemaDefinition({
    organizationId: organization.id,
    projectId: project.id,
    kind: 'entity',
    name: 'customer',
    fields: [{ name: 'plan', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
    createdByUserId: owner.id,
  });
  const mint = async (environmentId: string, scopes: ('mcp.read' | 'ingest.write' | 'project.configure')[]) =>
    (await mintApiKey({ organizationId: organization.id, projectId: project.id, environmentId, name: unique('key'), scopes, createdByUserId: owner.id })).rawKey;
  return {
    devAdminKey: await mint(dev.id, ['mcp.read', 'project.configure']),
    devReadKey: await mint(dev.id, ['mcp.read']),
    devIngestKey: await mint(dev.id, ['ingest.write']),
    prodIngestKey: await mint(prod.id, ['ingest.write']),
  };
}

async function callTool(rawKey: string, name: string, args: Record<string, unknown>) {
  const client = new Client({ name: 'backfill-e2e', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/v1/mcp`), { requestInit: { headers: { Authorization: `Bearer ${rawKey}` } } }));
  try {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as Array<{ text: string }>)[0].text;
    return { isError: result.isError === true, text, json: result.isError ? null : JSON.parse(text) };
  } finally {
    await client.close();
  }
}

describe('backfill loop (MCP + ingest + complete)', () => {
  it('registers, delivers a verifiable request, attributes tagged batches, and completes', async () => {
    const keys = await setup('Backfill E2E Org');

    // A read-only key cannot register an endpoint.
    mockedSetBackfillEndpoint.mockImplementationOnce((params) => actual.setBackfillEndpoint({ ...params, resolver: publicResolver }));
    const refused = await callTool(keys.devReadKey, 'set_backfill_endpoint', { url: 'https://backfill.example.com/hook', schemas: [{ kind: 'entity', name: 'customer' }] });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('project.configure');
    mockedSetBackfillEndpoint.mockReset();
    mockedSetBackfillEndpoint.mockImplementation((...args) => actual.setBackfillEndpoint(...args));

    mockedSetBackfillEndpoint.mockImplementationOnce((params) => actual.setBackfillEndpoint({ ...params, resolver: publicResolver }));
    const registered = await callTool(keys.devAdminKey, 'set_backfill_endpoint', { url: 'https://backfill.example.com/hook', schemas: [{ kind: 'entity', name: 'customer' }] });
    expect(registered.json.signing_secret).toMatch(/^whsec_/);
    const secret: string = registered.json.signing_secret;

    const sent: BackfillDeliveryRequest[] = [];
    mockedRequestBackfill.mockImplementationOnce((params) =>
      actual.requestBackfill({
        ...params,
        resolver: publicResolver,
        sleep: async () => {},
        transport: async (delivery) => {
          sent.push(delivery);
          return 202;
        },
      }),
    );
    const requested = await callTool(keys.devAdminKey, 'request_backfill', {});
    expect(requested.json).toMatchObject({ status: 'delivered', delivery_attempts: 1 });
    const backfillId: string = requested.json.backfill_id;
    const { 'webhook-id': webhookId, 'webhook-timestamp': timestamp, 'webhook-signature': signature } = sent[0].headers;
    expect(signature).toBe(signStandardWebhook(secret, webhookId, Number(timestamp), sent[0].body));
    expect(JSON.parse(sent[0].body)).toMatchObject({ type: 'backfill.requested', backfill_id: backfillId, environment: 'dev' });

    // The integrator resends through ordinary ingest, tagged with the backfill id.
    const ingest = await fetch(`${baseUrl}/v1/ingest/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.devIngestKey}`, 'X-GrowthOS-Backfill-Id': backfillId },
      body: JSON.stringify({ type: 'customer', records: [{ id: 'c1', attributes: { plan: 'pro' } }, { id: 'c2', attributes: { plan: 'free' } }] }),
    });
    expect(ingest.status).toBe(202);
    // A prod key's batch carrying the dev backfill's id is ingested but not attributed.
    const foreign = await fetch(`${baseUrl}/v1/ingest/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.prodIngestKey}`, 'X-GrowthOS-Backfill-Id': backfillId },
      body: JSON.stringify({ type: 'customer', records: [{ id: 'p1', attributes: { plan: 'pro' } }] }),
    });
    expect(await foreign.json()).toMatchObject({ accepted: 1 });

    const receiving = await callTool(keys.devReadKey, 'get_backfill_status', { backfill_id: backfillId });
    expect(receiving.json).toMatchObject({ status: 'receiving', progress: { batches: 1, accepted: 2 } });

    // The prod key cannot close the dev backfill; the dev key can, once.
    const wrongEnvironment = await fetch(`${baseUrl}/v1/backfills/${backfillId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.prodIngestKey}` },
      body: JSON.stringify({ status: 'completed', records_sent: 2, batches: 1 }),
    });
    expect(wrongEnvironment.status).toBe(404);
    const complete = await fetch(`${baseUrl}/v1/backfills/${backfillId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.devIngestKey}` },
      body: JSON.stringify({ status: 'completed', records_sent: 2, batches: 1 }),
    });
    expect(complete.status).toBe(200);
    const again = await fetch(`${baseUrl}/v1/backfills/${backfillId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.devIngestKey}` },
      body: JSON.stringify({ status: 'completed', records_sent: 2, batches: 1 }),
    });
    expect(again.status).toBe(409);

    const listed = await callTool(keys.devReadKey, 'list_backfills', {});
    expect(listed.json.endpoint).toEqual({ url: 'https://backfill.example.com/hook', schemas: [{ kind: 'entity', name: 'customer' }], last_changed_at: expect.any(String) });
    expect(JSON.stringify(listed.json)).not.toContain('whsec_');
    expect(listed.json.backfills[0]).toMatchObject({ backfill_id: backfillId, status: 'completed', report: { records_sent: 2, batches: 1 } });
  });

  it('refuses a malformed completion report', async () => {
    const keys = await setup('Backfill Bad Report Org');
    const response = await fetch(`${baseUrl}/v1/backfills/anything/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.devIngestKey}` },
      body: JSON.stringify({ status: 'done', records_sent: -1 }),
    });
    expect(response.status).toBe(400);
  });
});
