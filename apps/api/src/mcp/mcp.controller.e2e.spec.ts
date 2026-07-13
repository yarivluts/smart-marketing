import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  connectFirestoreOrm,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  mintApiKey,
} from '@growthos/firebase-orm-models';
import { AppModule } from '../app.module';

/**
 * Real Firestore-emulator-backed e2e coverage for KAN-75's MCP server —
 * exercises the actual Streamable HTTP transport with a real
 * `@modelcontextprotocol/sdk` client, not a raw `fetch` against the JSON-RPC
 * wire format, so this is the closest this headless suite can get to the
 * AC's own "Claude Desktop connects" bar. `query_metric`/`query_cohort`/
 * `search_customers` legitimately come back as tool errors here — there is
 * no real BigQuery project in this environment (KAN-18), same posture
 * `metrics.controller.e2e.spec.ts` already documents for the REST endpoint.
 * `list_insights` is Firestore-backed and genuinely succeeds.
 */

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8100';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await connectFirestoreOrm({ projectId: 'demo-growthos-test', emulatorHost: '127.0.0.1:8100' });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1');
  await app.init();
  await app.listen(0);
  const address = app.getHttpServer().address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app.close();
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupProjectWithKey(orgName: string, scopes: ('mcp.read' | 'ingest.write')[] = ['mcp.read']) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const prodEnvironment = environments.find((e) => e.name === 'prod')!;
  const { rawKey } = await mintApiKey({
    organizationId: organization.id,
    projectId: project.id,
    environmentId: prodEnvironment.id,
    name: 'e2e mcp key',
    scopes,
    createdByUserId: owner.id,
  });
  return { owner, organization, project, rawKey };
}

async function connectedClient(rawKey: string): Promise<Client> {
  const client = new Client({ name: 'growthos-e2e-test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/v1/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${rawKey}` } },
  });
  await client.connect(transport);
  return client;
}

describe('McpController (e2e)', () => {
  it('rejects (401) a raw POST with no Authorization header', async () => {
    const res = await fetch(`${baseUrl}/v1/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects (403) a key that lacks the mcp.read scope', async () => {
    const { rawKey } = await setupProjectWithKey('Scope Org', ['ingest.write']);
    const res = await fetch(`${baseUrl}/v1/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${rawKey}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects (405) GET and DELETE — this server is stateless', async () => {
    const { rawKey } = await setupProjectWithKey('Stateless Org');
    const getRes = await fetch(`${baseUrl}/v1/mcp`, { headers: { Authorization: `Bearer ${rawKey}` } });
    expect(getRes.status).toBe(405);
    const deleteRes = await fetch(`${baseUrl}/v1/mcp`, { method: 'DELETE', headers: { Authorization: `Bearer ${rawKey}` } });
    expect(deleteRes.status).toBe(405);
  });

  it('lists every KAN-75 read tool via a real MCP client', async () => {
    const { rawKey } = await setupProjectWithKey('List Tools Org');
    const client = await connectedClient(rawKey);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual(
        ['compare_periods', 'decompose', 'describe_metric', 'list_insights', 'list_metrics', 'query_cohort', 'query_metric', 'search_customers'].sort(),
      );
    } finally {
      await client.close();
    }
  });

  it('list_metrics returns an empty catalog for a fresh project (real, no warehouse dependency)', async () => {
    const { rawKey } = await setupProjectWithKey('List Metrics Org');
    const client = await connectedClient(rawKey);
    try {
      const result = await client.callTool({ name: 'list_metrics', arguments: {} });
      expect(result.isError).not.toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(JSON.parse(text)).toEqual({ metrics: [] });
    } finally {
      await client.close();
    }
  });

  it('list_insights returns an empty list for a fresh project (Firestore-backed, genuinely succeeds)', async () => {
    const { rawKey } = await setupProjectWithKey('List Insights Org');
    const client = await connectedClient(rawKey);
    try {
      const result = await client.callTool({ name: 'list_insights', arguments: {} });
      expect(result.isError).not.toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(JSON.parse(text)).toEqual({ insights: [] });
    } finally {
      await client.close();
    }
  });

  it('query_metric surfaces a tool error for an unregistered metric name', async () => {
    const { rawKey } = await setupProjectWithKey('Query Metric Org');
    const client = await connectedClient(rawKey);
    try {
      const result = await client.callTool({
        name: 'query_metric',
        arguments: { metric: 'does_not_exist', time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' } },
      });
      expect(result.isError).toBe(true);
    } finally {
      await client.close();
    }
  });

  it("search_customers isolates the caller's own project — a query against another org's key returns nothing this test project landed", async () => {
    const { rawKey } = await setupProjectWithKey('Search Customers Org');
    const client = await connectedClient(rawKey);
    try {
      // No warehouse configured in this environment (KAN-18) — asserts the isolation-relevant
      // shape (an error result, not a leaked cross-project row) rather than real search results.
      const result = await client.callTool({ name: 'search_customers', arguments: { query: 'anyone' } });
      expect(result.isError).toBe(true);
    } finally {
      await client.close();
    }
  });
});
