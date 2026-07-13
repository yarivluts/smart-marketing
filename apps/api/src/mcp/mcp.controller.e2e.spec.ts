import type { AddressInfo } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  connectFirestoreOrm,
  createOrganizationWithOwner,
  createOrgPerson,
  createProject,
  ensureAutomationTargetSeeded,
  ensureUserForFirebaseSession,
  exchangeMcpAuthorizationCode,
  InMemoryTokenBucketRateLimiter,
  issueMcpAuthorizationCode,
  listAuditLogEntriesForOrg,
  mintApiKey,
  registerMcpOAuthClient,
  registerMetricDefinition,
  registerSchemaDefinition,
  WinEventModel,
} from '@growthos/firebase-orm-models';
import { AppModule } from '../app.module';
import { MCP_RATE_LIMITER } from './mcp-auth.guard';

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

/** A minimal, real `WinEventModel` (Firestore-backed, so `list_insights` genuinely reads it back) for the KAN-77 cross-project isolation tests below. */
async function seedWinEvent(organizationId: string, projectId: string, label: string): Promise<WinEventModel> {
  const win = new WinEventModel();
  win.organization_id = organizationId;
  win.project_id = projectId;
  win.environment_id = 'env-1';
  win.win_rule_id = unique('rule');
  win.win_rule_name = label;
  win.win_type = 'generic';
  win.schema_name = 'order_completed';
  win.raw_record_id = unique('record');
  win.client_id = unique('client');
  win.payload = { label };
  win.occurred_at = new Date().toISOString();
  win.created_at = new Date().toISOString();
  win.setPathParams({ organization_id: organizationId, project_id: projectId });
  await win.save();
  return win;
}

async function setupProjectWithKey(
  orgName: string,
  scopes: ('mcp.read' | 'ingest.write' | 'dashboards.write')[] = ['mcp.read'],
) {
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

function makePkcePair() {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

/**
 * Mints a real MCP OAuth access token for `organization`'s owner (who holds
 * every permission, `ALL_PERMISSIONS`) — the only way KAN-76's
 * `propose_action`/`approve_action` can ever succeed end to end, since
 * `automation.execute`/`automation.approve` are permanently withheld from
 * API key scopes (see `mcp-act-authorization.ts`'s own doc comment).
 */
async function mintOAuthAccessToken(organizationId: string, projectId: string, ownerId: string): Promise<string> {
  const client = await registerMcpOAuthClient({ clientName: 'e2e act-tools client', redirectUris: ['https://client.example.com/callback'] });
  const { codeVerifier, codeChallenge } = makePkcePair();
  const { code } = await issueMcpAuthorizationCode({
    clientId: client.id,
    redirectUri: client.redirect_uris[0],
    codeChallenge,
    codeChallengeMethod: 'S256',
    organizationId,
    projectId,
    grantedByUserId: ownerId,
  });
  const result = await exchangeMcpAuthorizationCode({
    code,
    clientId: client.id,
    redirectUri: client.redirect_uris[0],
    codeVerifier,
  });
  if (!result.ok) {
    throw new Error(`Failed to exchange MCP authorization code: ${result.error.message}`);
  }
  return result.value.accessToken;
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

  it('lists every KAN-75 read tool plus KAN-76 act tool via a real MCP client', async () => {
    const { rawKey } = await setupProjectWithKey('List Tools Org');
    const client = await connectedClient(rawKey);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual(
        [
          'approve_action',
          'compare_periods',
          'create_goal',
          'create_segment',
          'decompose',
          'describe_metric',
          'list_insights',
          'list_metrics',
          'propose_action',
          'query_cohort',
          'query_metric',
          'search_customers',
        ].sort(),
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

  describe('KAN-76 act tools', () => {
    it('propose_action/approve_action return a clean tool error for an API key — automation.execute/approve can never be a key scope', async () => {
      const { rawKey } = await setupProjectWithKey('Act Tools Key Org');
      const client = await connectedClient(rawKey);
      try {
        const proposeResult = await client.callTool({
          name: 'propose_action',
          arguments: { target_id: 'does-not-matter', after_daily_budget_usd: 110 },
        });
        expect(proposeResult.isError).toBe(true);
        expect((proposeResult.content as Array<{ type: string; text: string }>)[0].text).toContain('automation.execute');

        const approveResult = await client.callTool({ name: 'approve_action', arguments: { action_id: 'does-not-matter' } });
        expect(approveResult.isError).toBe(true);
        expect((approveResult.content as Array<{ type: string; text: string }>)[0].text).toContain('automation.approve');
      } finally {
        await client.close();
      }
    });

    it('create_goal/create_segment return a clean tool error for an API key lacking dashboards.write', async () => {
      const { rawKey } = await setupProjectWithKey('Act Tools No Scope Org', ['mcp.read']);
      const client = await connectedClient(rawKey);
      try {
        const goalResult = await client.callTool({
          name: 'create_goal',
          arguments: {
            name: 'X',
            metric_name: 'signups',
            direction: 'maximize',
            target_value: 100,
            start_date: '2026-01-01',
            deadline: '2026-02-01',
            rhythm: 'even',
            owner_person_id: 'does-not-matter',
          },
        });
        expect(goalResult.isError).toBe(true);
        expect((goalResult.content as Array<{ type: string; text: string }>)[0].text).toContain('dashboards.write');

        const segmentResult = await client.callTool({
          name: 'create_segment',
          arguments: { name: 'X', schema_name: 'customer', filters: [{ field: 'plan', op: '=', value: 'pro' }] },
        });
        expect(segmentResult.isError).toBe(true);
        expect((segmentResult.content as Array<{ type: string; text: string }>)[0].text).toContain('dashboards.write');
      } finally {
        await client.close();
      }
    });

    it('create_goal creates a real goal for an API key holding dashboards.write', async () => {
      const { owner, organization, project, rawKey } = await setupProjectWithKey('Act Tools Create Goal Org', ['mcp.read', 'dashboards.write']);
      await registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name: 'signups',
        definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'fact_funnel_event', timeColumn: 'ts', filters: [] } },
        dimensions: [],
        createdByUserId: owner.id,
      });
      const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });

      const client = await connectedClient(rawKey);
      try {
        const result = await client.callTool({
          name: 'create_goal',
          arguments: {
            name: 'Q3 signups',
            metric_name: 'signups',
            direction: 'maximize',
            target_value: 1000,
            start_date: '2026-07-01',
            deadline: '2026-09-30',
            rhythm: 'even',
            owner_person_id: person.id,
          },
        });
        expect(result.isError).not.toBe(true);
        const body = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text) as { id: string; name: string };
        expect(body.name).toBe('Q3 signups');
        expect(body.id).toBeTruthy();
      } finally {
        await client.close();
      }
    });

    it('create_segment saves a real segment definition for an API key holding dashboards.write', async () => {
      const { owner, organization, project, rawKey } = await setupProjectWithKey('Act Tools Create Segment Org', ['mcp.read', 'dashboards.write']);
      await registerSchemaDefinition({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'entity',
        name: 'customer',
        fields: [
          { name: 'customer_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
          { name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
        ],
        createdByUserId: owner.id,
      });

      const client = await connectedClient(rawKey);
      try {
        const result = await client.callTool({
          name: 'create_segment',
          arguments: { name: 'Pro customers', schema_name: 'customer', filters: [{ field: 'plan', op: '=', value: 'pro' }] },
        });
        expect(result.isError).not.toBe(true);
        const body = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text) as { id: string; name: string };
        expect(body.name).toBe('Pro customers');
        expect(body.id).toBeTruthy();
      } finally {
        await client.close();
      }
    });

    it('propose_action then approve_action succeed end to end for an OAuth-authenticated org owner', async () => {
      const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
      const { organization } = await createOrganizationWithOwner({ name: 'Act Tools OAuth Org', ownerUserId: owner.id });
      const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
      const target = await ensureAutomationTargetSeeded({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: 'live',
        targetId: unique('campaign'),
        targetType: 'campaign',
        label: 'Summer Sale',
        initialDailyBudgetUsd: 100,
        seededByUserId: owner.id,
      });
      const accessToken = await mintOAuthAccessToken(organization.id, project.id, owner.id);

      const client = await connectedClient(accessToken);
      try {
        const proposeResult = await client.callTool({
          name: 'propose_action',
          arguments: { target_id: target.id, after_daily_budget_usd: 110 },
        });
        expect(proposeResult.isError).not.toBe(true);
        const proposed = JSON.parse((proposeResult.content as Array<{ type: string; text: string }>)[0].text) as {
          id: string;
          status: string;
        };
        expect(proposed.status).toBe('awaiting_approval');

        const approveResult = await client.callTool({ name: 'approve_action', arguments: { action_id: proposed.id } });
        expect(approveResult.isError).not.toBe(true);
        const approved = JSON.parse((approveResult.content as Array<{ type: string; text: string }>)[0].text) as {
          id: string;
          status: string;
        };
        expect(approved.status).toBe('approved');
      } finally {
        await client.close();
      }
    });
  });

  describe('KAN-77 cross-project isolation via MCP', () => {
    it("list_insights never surfaces another project's win events — the AC's own \"project-A token cannot list/query anything of project B\"", async () => {
      const projectA = await setupProjectWithKey('MCP Isolation Org A');
      const projectB = await setupProjectWithKey('MCP Isolation Org B');
      const winA = await seedWinEvent(projectA.organization.id, projectA.project.id, 'Project A win');
      const winB = await seedWinEvent(projectB.organization.id, projectB.project.id, 'Project B win');

      const clientA = await connectedClient(projectA.rawKey);
      try {
        const result = await clientA.callTool({ name: 'list_insights', arguments: {} });
        expect(result.isError).not.toBe(true);
        const body = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text) as { insights: Array<{ id: string }> };
        const ids = body.insights.map((insight) => insight.id);
        expect(ids).toContain(winA.id);
        expect(ids).not.toContain(winB.id);
      } finally {
        await clientA.close();
      }

      const clientB = await connectedClient(projectB.rawKey);
      try {
        const result = await clientB.callTool({ name: 'list_insights', arguments: {} });
        const body = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text) as { insights: Array<{ id: string }> };
        const ids = body.insights.map((insight) => insight.id);
        expect(ids).toContain(winB.id);
        expect(ids).not.toContain(winA.id);
      } finally {
        await clientB.close();
      }
    });

    it('no tool argument can override the credential-derived organizationId/projectId scope', async () => {
      const projectA = await setupProjectWithKey('MCP Isolation Args Org A');
      const projectB = await setupProjectWithKey('MCP Isolation Args Org B');
      const winB = await seedWinEvent(projectB.organization.id, projectB.project.id, 'Project B win');

      const clientA = await connectedClient(projectA.rawKey);
      try {
        // list_insights' own schema only declares "limit" — smuggled-in fields naming project B are
        // never read by the handler, which resolves org/project from `auth` (the authenticated
        // credential) alone, never from `args`.
        const result = await clientA.callTool({
          name: 'list_insights',
          arguments: { limit: 10, organizationId: projectB.organization.id, projectId: projectB.project.id } as never,
        });
        expect(result.isError).not.toBe(true);
        const body = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text) as { insights: Array<{ id: string }> };
        expect(body.insights.map((insight) => insight.id)).not.toContain(winB.id);
      } finally {
        await clientA.close();
      }
    });
  });

  describe('KAN-77 audit logging: every tool call records the principal + client identity', () => {
    it('an API-key tool call audits actor_type "api_key" with a matching client_id', async () => {
      const { organization, rawKey } = await setupProjectWithKey('MCP Audit API Key Org');
      const client = await connectedClient(rawKey);
      try {
        await client.callTool({ name: 'list_metrics', arguments: {} });
      } finally {
        await client.close();
      }

      const entries = await listAuditLogEntriesForOrg(organization.id);
      const entry = entries.find((e) => e.action === 'mcp.tool_call' && e.target_id === 'list_metrics');
      expect(entry).toBeTruthy();
      expect(entry?.actor_type).toBe('api_key');
      expect(entry?.client_type).toBe('mcp_api_key');
      expect(entry?.client_id).toBe(entry?.actor_id);
    });

    it('an OAuth tool call audits the granting user as the principal and the OAuth client_id as a distinct client identity', async () => {
      const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
      const { organization } = await createOrganizationWithOwner({ name: 'MCP Audit OAuth Org', ownerUserId: owner.id });
      const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
      const accessToken = await mintOAuthAccessToken(organization.id, project.id, owner.id);

      const client = await connectedClient(accessToken);
      try {
        await client.callTool({ name: 'list_insights', arguments: {} });
      } finally {
        await client.close();
      }

      const entries = await listAuditLogEntriesForOrg(organization.id);
      const entry = entries.find((e) => e.action === 'mcp.tool_call' && e.target_id === 'list_insights');
      expect(entry).toBeTruthy();
      expect(entry?.actor_type).toBe('user');
      expect(entry?.actor_id).toBe(owner.id);
      expect(entry?.client_type).toBe('mcp_oauth');
      expect(entry?.client_id).toBeTruthy();
      expect(entry?.client_id).not.toBe(owner.id);
    });

    it('a permission-denied act tool attempt is still audited (summary marked as an error)', async () => {
      const { organization, rawKey } = await setupProjectWithKey('MCP Audit Denied Org', ['mcp.read']);
      const client = await connectedClient(rawKey);
      try {
        await client.callTool({
          name: 'create_goal',
          arguments: {
            name: 'X',
            metric_name: 'signups',
            direction: 'maximize',
            target_value: 1,
            start_date: '2026-01-01',
            deadline: '2026-02-01',
            rhythm: 'even',
            owner_person_id: 'does-not-matter',
          },
        });
      } finally {
        await client.close();
      }

      const entries = await listAuditLogEntriesForOrg(organization.id);
      const entry = entries.find((e) => e.action === 'mcp.tool_call' && e.target_id === 'create_goal');
      expect(entry).toBeTruthy();
      expect(entry?.summary).toContain('error');
    });
  });
});

describe('McpController (e2e) — per-credential rate limiting (KAN-77)', () => {
  // A dedicated app instance with a tiny rate-limit bucket overridden in, so this suite can trip a
  // 429 in a handful of requests rather than needing the real default capacity — kept separate from
  // the main `app`/`baseUrl` above the same way `IngestController`'s own rate-limit suite is, so this
  // override never affects any other test's key.
  let limitedApp: INestApplication;
  let limitedBaseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MCP_RATE_LIMITER)
      .useValue(new InMemoryTokenBucketRateLimiter({ capacity: 1, refillPerSecond: 0.001 }))
      .compile();
    limitedApp = moduleRef.createNestApplication();
    limitedApp.setGlobalPrefix('v1');
    await limitedApp.init();
    await limitedApp.listen(0);
    const address = limitedApp.getHttpServer().address() as AddressInfo;
    limitedBaseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await limitedApp.close();
  });

  it('rejects (429) once an MCP credential exhausts its bucket, with a Retry-After header', async () => {
    const { rawKey } = await setupProjectWithKey('MCP Rate Limit Org');
    const request = () =>
      fetch(`${limitedBaseUrl}/v1/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${rawKey}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      });

    expect((await request()).status).not.toBe(429); // capacity 1: the first request reaches the handler...
    const limited = await request(); // ...the second finds the bucket already spent.
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
  });
});
