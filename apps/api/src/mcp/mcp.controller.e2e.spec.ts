import type { AddressInfo } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  confirmOnboardingFunnelSteps,
  connectFirestoreOrmAdmin,
  createOrganizationWithOwner,
  createOrgPerson,
  createProject,
  ensureAutomationTargetSeeded,
  ensureUserForFirebaseSession,
  exchangeMcpAuthorizationCode,
  getOnboardingState,
  ingestBatch,
  InMemoryTokenBucketRateLimiter,
  issueMcpAuthorizationCode,
  listAuditLogEntriesForOrg,
  listQuarantinedRecordsForProject,
  mintApiKey,
  registerMcpOAuthClient,
  registerMetricDefinition,
  registerSchemaDefinition,
  queryProjectFunnelSteps,
  queryMetrics,
  searchProjectCustomers,
  InMemoryMetricQueryResultCache,
  WinEventModel,
  type WarehouseQueryExecutor,
} from '@growthos/firebase-orm-models';
import { AppModule } from '../app.module';
import { MCP_RATE_LIMITER } from './mcp-auth.guard';

// A pass-through wrapper, so every test here runs the real `queryProjectFunnelSteps` (and, with no warehouse in
// this environment, gets its real "not configured" error) unless a test supplies a warehouse for one call.
jest.mock('@growthos/firebase-orm-models', () => {
  const actual = jest.requireActual('@growthos/firebase-orm-models');
  return {
    ...actual,
    queryProjectFunnelSteps: jest.fn((...args: unknown[]) => actual.queryProjectFunnelSteps(...args)),
    queryMetrics: jest.fn((...args: unknown[]) => actual.queryMetrics(...args)),
    searchProjectCustomers: jest.fn((...args: unknown[]) => actual.searchProjectCustomers(...args)),
  };
});
const mockedQueryProjectFunnelSteps = queryProjectFunnelSteps as jest.MockedFunction<typeof queryProjectFunnelSteps>;
const mockedQueryMetrics = queryMetrics as jest.MockedFunction<typeof queryMetrics>;
const realQueryMetrics = jest.requireActual<typeof import('@growthos/firebase-orm-models')>('@growthos/firebase-orm-models').queryMetrics;
const realQueryProjectFunnelSteps = jest.requireActual<typeof import('@growthos/firebase-orm-models')>('@growthos/firebase-orm-models').queryProjectFunnelSteps;
const mockedSearchProjectCustomers = searchProjectCustomers as jest.MockedFunction<typeof searchProjectCustomers>;
const realSearchProjectCustomers = jest.requireActual<typeof import('@growthos/firebase-orm-models')>('@growthos/firebase-orm-models').searchProjectCustomers;

/** Runs the next `search_customers` call's REAL service (real SQL, real schema-registry read) against `executor`. */
function nextSearchCustomersUsesWarehouse(executor: WarehouseQueryExecutor): void {
  mockedSearchProjectCustomers.mockImplementationOnce((params) => realSearchProjectCustomers({ ...params, executor }));
}

/** Runs the next `query_funnel` call's REAL service (saved funnel from Firestore, real SQL) against `executor`. */
function nextQueryFunnelUsesWarehouse(executor: WarehouseQueryExecutor): void {
  mockedQueryProjectFunnelSteps.mockImplementationOnce((params) => realQueryProjectFunnelSteps({ ...params, executor }));
}

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
  // Admin SDK, not the client SDK (KAN-128). These specs previously called
  // connectFirestoreOrm against the emulator, which is the gRPC Listen stream
  // that corrupts - the signature being RESOURCE_EXHAUSTED with a nonsense
  // multi-gigabyte size, a garbage length prefix rather than a real message. It
  // failed CI on documentation-only pull requests. The Admin SDK reads
  // FIRESTORE_EMULATOR_HOST from the environment itself and opens no long-lived
  // stream, so there is no framing to lose.
  await connectFirestoreOrmAdmin({ projectId: 'demo-growthos-test' });

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
async function seedWinEvent(organizationId: string, projectId: string, environmentId: string, label: string): Promise<WinEventModel> {
  const win = new WinEventModel();
  win.organization_id = organizationId;
  win.project_id = projectId;
  win.environment_id = environmentId;
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
  scopes: ('mcp.read' | 'ingest.write' | 'dashboards.write' | 'metrics.write' | 'schema.write' | 'project.configure')[] = ['mcp.read'],
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
  const devEnvironment = environments.find((e) => e.name === 'dev')!;
  return { owner, organization, project, rawKey, environmentId: prodEnvironment.id, devEnvironmentId: devEnvironment.id };
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
          'archive_metric',
          'delete_goal',
          'get_goal_progress',
          'list_goals',
          'archive_project',
          'audit_installation_gaps',
          'create_hook_endpoint',
          'get_setup_health',
          'evolve_metric',
          'list_hook_endpoints',
          'list_insights',
          'list_metric_versions',
          'list_metrics',
          'list_schemas',
          'list_segments',
          'list_warehouse_tables',
          'list_win_rules',
          'purge_project_data',
          'reexport_raw_records',
          'register_metric',
          'register_schema',
          'evolve_schema',
          'set_funnel',
          'set_goal_status',
          'set_hook_signing_secret',
          'update_project_settings',
          'propose_action',
          'query_cohort',
          'query_funnel',
          'query_metric',
          'search_customers',
          'validate_records',
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

  it('query_metric returns one row per bucket: 0 for a count metric, null for a formula (KAN-210 follow-up)', async () => {
    const { owner, organization, project, rawKey } = await setupProjectWithKey('Query Metric Fill Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'signups',
      definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'fact_funnel_event', timeColumn: 'ts', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'signups_doubled',
      definition: { kind: 'formula', formula: 'signups * 2' },
      dimensions: [],
      createdByUserId: owner.id,
    });
    const warehouse: WarehouseQueryExecutor = {
      execute: () => Promise.resolve([{ bucket_date: '2026-09-19', signups: 2, signups_doubled: 4 }]),
    };
    mockedQueryMetrics.mockImplementationOnce((params) => realQueryMetrics({ ...params, executor: warehouse, cache: new InMemoryMetricQueryResultCache() }));

    const client = await connectedClient(rawKey);
    try {
      const result = await client.callTool({
        name: 'query_metric',
        arguments: { metric: ['signups', 'signups_doubled'], time: { start: '2026-09-19', end: '2026-09-21', grain: 'day' } },
      });
      expect(result.isError).not.toBe(true);
      const body = JSON.parse((result.content as Array<{ text: string }>)[0].text) as { series: unknown[] };
      expect(body.series).toEqual([
        { bucket_date: '2026-09-19', signups: 2, signups_doubled: 4 },
        { bucket_date: '2026-09-20', signups: 0, signups_doubled: null },
        { bucket_date: '2026-09-21', signups: 0, signups_doubled: null },
      ]);
      expect(mockedQueryMetrics.mock.calls.at(-1)?.[0].fillEmptyBuckets).toBe(true);
    } finally {
      await client.close();
    }
  });

  it('compare_periods reports each period\'s own value of a ratio - 2/101 = 1.98% for day 1 at 1/1 plus day 2 at 1/100, NOT the 50.5% mean of its daily rates (B24)', async () => {
    const { owner, organization, project, rawKey } = await setupProjectWithKey('Compare Periods Ratio Org');
    for (const [name, column] of [
      ['lp_visitors', 'visitors'],
      ['lp_conversions', 'conversions'],
    ] as const) {
      await registerMetricDefinition({
        organizationId: organization.id,
        projectId: project.id,
        name,
        definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_landing_page_performance', column, timeColumn: 'activity_date', filters: [] } },
        dimensions: [],
        createdByUserId: owner.id,
      });
    }
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'lp_conversion_rate',
      definition: { kind: 'formula', formula: 'lp_conversions / lp_visitors' },
      dimensions: [],
      unit: 'ratio',
      createdByUserId: owner.id,
    });
    // Answers the way the compiled SQL would: per day for the bucketed series; for the whole-range
    // (`total` grain) query, each period's summed conversions over its summed visitors.
    const queries: string[] = [];
    const warehouse: WarehouseQueryExecutor = {
      execute: (query) => {
        queries.push(query.sql);
        if (query.sql.includes('DATE_TRUNC')) {
          return Promise.resolve([
            { period: 'current', bucket_date: '2026-09-01', lp_conversion_rate: 1 },
            { period: 'current', bucket_date: '2026-09-02', lp_conversion_rate: 0.01 },
            { period: 'previous', bucket_date: '2026-08-30', lp_conversion_rate: 0.1 },
            { period: 'previous', bucket_date: '2026-08-31', lp_conversion_rate: 0.1 },
          ]);
        }
        return Promise.resolve([
          { period: 'current', bucket_date: '2026-09-01', lp_conversion_rate: 2 / 101 },
          { period: 'previous', bucket_date: '2026-08-30', lp_conversion_rate: 0.1 },
        ]);
      },
    };
    const withWarehouse: typeof realQueryMetrics = (params) => realQueryMetrics({ ...params, executor: warehouse, cache: new InMemoryMetricQueryResultCache() });
    mockedQueryMetrics.mockImplementationOnce(withWarehouse).mockImplementationOnce(withWarehouse);

    const client = await connectedClient(rawKey);
    try {
      const result = await client.callTool({
        name: 'compare_periods',
        arguments: { metric: 'lp_conversion_rate', time: { start: '2026-09-01', end: '2026-09-02', grain: 'day', compare: 'previous_period' } },
      });
      expect(result.isError).not.toBe(true);
      const body = JSON.parse((result.content as Array<{ text: string }>)[0].text) as {
        period_totals: Array<{ dimensions: Record<string, unknown>; current: Record<string, number>; previous: Record<string, number>; change_pct: Record<string, number> }>;
      };
      expect(body.period_totals).toHaveLength(1);
      const [totals] = body.period_totals;
      expect(totals.current.lp_conversion_rate).toBeCloseTo(2 / 101, 10);
      expect(totals.current.lp_conversion_rate).not.toBeCloseTo(0.505, 2);
      expect(totals.previous.lp_conversion_rate).toBeCloseTo(0.1, 10);
      // 1.98% vs. 10%: down ~80%. The mean of daily rates would have claimed up 405%.
      expect(totals.change_pct.lp_conversion_rate).toBeCloseTo(((2 / 101 - 0.1) / 0.1) * 100, 6);
      // The period values came from a whole-range query, not from the bucketed series.
      expect(queries.some((sql) => sql.includes('CAST(@time_start_current AS DATE) AS bucket_date') && !sql.includes('DATE_TRUNC'))).toBe(true);
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

  // KAN-137: an events-only project has populated cohorts and an empty Customer 360. An empty
  // answer has to say whether nothing matched or nothing could ever match.
  it('search_customers says Customer 360 has no source when the project has no entity schema (KAN-137)', async () => {
    const { owner, organization, project, rawKey } = await setupProjectWithKey('Search Customers Events Only Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'user_signed_up',
      fields: [{ name: 'plan', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });
    const client = await connectedClient(rawKey);
    try {
      nextSearchCustomersUsesWarehouse({ execute: () => Promise.resolve([]) });
      const result = await client.callTool({ name: 'search_customers', arguments: { query: 'someone@example.com' } });
      expect(result.isError).toBeFalsy();
      const body = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(body.results).toEqual([]);
      expect(body.empty_reason).toBe('no_entity_schemas');
      expect(body.note).toContain('no active entity-kind schema');
    } finally {
      await client.close();
    }
  });

  it('search_customers reports a plain miss, with no empty_reason, once an entity schema exists (KAN-137)', async () => {
    const { owner, organization, project, rawKey } = await setupProjectWithKey('Search Customers Entity Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'entity',
      name: 'customer',
      fields: [{ name: 'email', type: 'string', isRequired: false, isPii: true, isIdentityKey: true }],
      createdByUserId: owner.id,
    });
    const client = await connectedClient(rawKey);
    try {
      nextSearchCustomersUsesWarehouse({ execute: () => Promise.resolve([]) });
      const result = await client.callTool({ name: 'search_customers', arguments: { query: 'nobody@example.com' } });
      expect(result.isError).toBeFalsy();
      const body = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(body).toEqual({ results: [], has_more: false, limit: expect.any(Number) });
    } finally {
      await client.close();
    }
  });

  it('query_funnel surfaces a tool error with no real warehouse configured (KAN-18)', async () => {
    const { owner, organization, project, rawKey } = await setupProjectWithKey('Query Funnel Org');
    // A confirmed funnel is what makes the tool actually query the warehouse — without one it
    // legitimately returns an empty list (nothing to show) and never touches the executor. Confirm
    // one so this test still exercises the "no warehouse → tool error" path it is asserting.
    await confirmOnboardingFunnelSteps({
      organizationId: organization.id,
      projectId: project.id,
      userId: owner.id,
      steps: [{ eventSchemaName: 'signup', stageKey: 'signup', order: 0 }],
    });
    const client = await connectedClient(rawKey);
    try {
      const result = await client.callTool({ name: 'query_funnel', arguments: {} });
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

    it('the self-service admin tools let a key finish its own project setup: read the warehouse catalog, register a metric, declare currency/timezone, provision a signed webhook', async () => {
      const { project, rawKey } = await setupProjectWithKey('Admin Tools Self Service Org', ['mcp.read', 'metrics.write', 'schema.write', 'project.configure', 'ingest.write']);
      const client = await connectedClient(rawKey);
      const textOf = (result: Awaited<ReturnType<Client['callTool']>>): string => (result.content as Array<{ text: string }>)[0].text;
      try {
        // The catalog an agent needs before it can write a valid metric at all.
        const tables = JSON.parse(textOf(await client.callTool({ name: 'list_warehouse_tables', arguments: {} }))) as {
          tables: Array<{ table: string; built: boolean; columns: Array<{ column: string; type: string }> }>;
        };
        const revenue = tables.tables.find((entry) => entry.table === 'fact_revenue_event');
        expect(revenue?.built).toBe(true);
        expect(revenue?.columns.map((column) => column.column)).toContain('amount');
        expect(tables.tables.find((entry) => entry.table === 'fact_funnel_step')?.built).toBe(false);

        /*
          Schema registration, the step that gated every self-serve integration.

          The registry is strict by design: a record whose event name is not registered, or
          that carries a property the schema does not declare, is rejected into quarantine. The
          service to register one has existed all along, but nothing exposed it to a key holder
          - the only REST route is session-cookie admin - so a customer with an API key could
          send perfectly good events forever and watch every one of them be quarantined, with
          no way to fix it that did not involve a GrowthOS engineer.
        */
        const schema = await client.callTool({
          name: 'register_schema',
          arguments: {
            kind: 'event',
            name: 'signup',
            fields: [
              { name: 'customer_id', type: 'string', is_required: true, is_identity_key: true },
              { name: 'plan', type: 'string' },
            ],
          },
        });
        expect(schema.isError ?? false).toBe(false);
        expect(JSON.parse(textOf(schema))).toMatchObject({ name: 'signup', kind: 'event', version: 1, status: 'active' });

        // Registering the same family twice is refused rather than silently forking it.
        expect((await client.callTool({
          name: 'register_schema',
          arguments: { kind: 'event', name: 'signup', fields: [{ name: 'customer_id', type: 'string' }] },
        })).isError).toBe(true);

        // Evolving it additively is allowed and supersedes v1.
        expect(JSON.parse(textOf(await client.callTool({
          name: 'evolve_schema',
          arguments: {
            kind: 'event',
            name: 'signup',
            fields: [
              { name: 'customer_id', type: 'string', is_required: true, is_identity_key: true },
              { name: 'plan', type: 'string' },
              { name: 'referrer', type: 'string' },
            ],
          },
        })))).toMatchObject({ name: 'signup', version: 2, status: 'active' });

        // It is now visible to the catalog tool a setup agent reads.
        const schemas = JSON.parse(textOf(await client.callTool({ name: 'list_schemas', arguments: {} }))) as {
          schemas: Array<{ name: string; version: number }>;
        };
        expect(schemas.schemas.find((entry) => entry.name === 'signup')?.version).toBe(2);
        // The undeclared-but-accepted event fields are stated, not left for a caller to discover by probing.
        const implicit = (schemas as unknown as { implicit_event_fields: Array<{ name: string; note: string }> }).implicit_event_fields;
        expect(implicit.map((field) => field.name)).toEqual(['anon_id', 'customer_id']);
        // Registration is irreversible: the note must not send integrators to declare a field stitching reads anyway.
        expect(implicit.every((field) => /whether or not it is declared/.test(field.note) && !/only to use it for identity stitching/.test(field.note))).toBe(true);

        // A metric written against that catalog registers; one naming a column the table lacks is refused with the reason.
        const registered = await client.callTool({
          name: 'register_metric',
          arguments: { name: 'collected_revenue', kind: 'aggregation', function: 'sum', table: 'fact_revenue_event', column: 'amount', time_column: 'ts', dimensions: ['plan'] },
        });
        expect(registered.isError ?? false).toBe(false);
        expect(JSON.parse(textOf(registered))).toMatchObject({ name: 'collected_revenue', version: 1, status: 'active' });

        const rejected = await client.callTool({
          name: 'register_metric',
          arguments: { name: 'bad_metric', kind: 'aggregation', function: 'sum', table: 'fact_revenue_event', column: 'amount', time_column: 'date' },
        });
        expect(rejected.isError).toBe(true);
        expect(textOf(rejected)).toContain('time column "date" does not exist');

        // Archiving retires the family.
        expect(JSON.parse(textOf(await client.callTool({ name: 'archive_metric', arguments: { name: 'collected_revenue' } })))).toMatchObject({ status: 'archived' });

        // Project self-description — the audit's J-03, previously impossible for any API key to do.
        expect(JSON.parse(textOf(await client.callTool({ name: 'update_project_settings', arguments: { currency: 'ils', timezone: 'Asia/Jerusalem' } })))).toMatchObject({
          currency: 'ILS',
          timezone: 'Asia/Jerusalem',
          name: 'Website',
        });
        expect((await client.callTool({ name: 'update_project_settings', arguments: { currency: 'shekels' } })).isError).toBe(true);

        // A signed webhook receiver, provisioned end to end.
        const hook = JSON.parse(textOf(await client.callTool({ name: 'create_hook_endpoint', arguments: { name: 'Product events' } }))) as {
          id: string;
          url_path: string;
          signature_header_name: string;
        };
        expect(hook.url_path.startsWith('/v1/hooks/')).toBe(true);
        expect(hook.signature_header_name).toBe('X-GrowthOS-Signature');

        const listed = JSON.parse(textOf(await client.callTool({ name: 'list_hook_endpoints', arguments: {} }))) as {
          hook_endpoints: Array<{ id: string; signing_secret_set: boolean; environment_id: string }>;
        };
        const created = listed.hook_endpoints.find((endpoint) => endpoint.id === hook.id);
        expect(created?.signing_secret_set).toBe(false);
        expect(project.id).toBeTruthy();
      } finally {
        await client.close();
      }
    });

    it('purge_project_data refuses without a matching confirm_project_id, so it can never be aimed at another project', async () => {
      const { project, rawKey } = await setupProjectWithKey('Admin Tools Purge Guard Org', ['mcp.read', 'ingest.write']);
      const client = await connectedClient(rawKey);
      try {
        const wrong = await client.callTool({ name: 'purge_project_data', arguments: { confirm_project_id: 'some-other-project' } });
        expect(wrong.isError).toBe(true);
        expect((wrong.content as Array<{ text: string }>)[0].text).toContain('nothing was deleted');

        const right = await client.callTool({ name: 'purge_project_data', arguments: { confirm_project_id: project.id } });
        expect(right.isError ?? false).toBe(false);
        expect(JSON.parse((right.content as Array<{ text: string }>)[0].text).deleted).toMatchObject({ raw_records: 0 });
      } finally {
        await client.close();
      }
    });

    it('every admin tool refuses a key that lacks its own scope, naming the scope it needs', async () => {
      const { rawKey } = await setupProjectWithKey('Admin Tools No Scope Org', ['mcp.read']);
      const client = await connectedClient(rawKey);
      try {
        const cases: Array<[string, Record<string, unknown>, string]> = [
          ['register_metric', { name: 'x', kind: 'aggregation', function: 'count', table: 'events', time_column: 'occurred_at' }, 'metrics.write'],
          ['archive_metric', { name: 'x' }, 'metrics.write'],
          ['set_goal_status', { goal_id: 'x', status: 'paused' }, 'dashboards.write'],
          ['update_project_settings', { currency: 'USD' }, 'project.configure'],
          ['archive_project', { archived: true }, 'project.configure'],
          ['create_hook_endpoint', { name: 'x' }, 'ingest.write'],
          ['reexport_raw_records', {}, 'ingest.write'],
          ['purge_project_data', { confirm_project_id: 'x' }, 'ingest.write'],
        ];
        for (const [tool, args, permission] of cases) {
          const result = await client.callTool({ name: tool, arguments: args });
          // Jest has no per-assertion message argument, so the tool name rides in the compared value.
          expect({ tool, isError: result.isError }).toEqual({ tool, isError: true });
          expect(`${tool}: ${(result.content as Array<{ text: string }>)[0].text}`).toContain(permission);
        }
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

    it('carries a metric unit through register/evolve, the catalog, query_metric and goals (KAN-213)', async () => {
      const { owner, organization, rawKey } = await setupProjectWithKey('MCP Metric Units Org', ['mcp.read', 'metrics.write', 'dashboards.write']);
      const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
      const textOfResult = (result: Awaited<ReturnType<Client['callTool']>>) => (result.content as Array<{ text: string }>)[0].text;
      const lpAggregation = (column: string) => ({ name: `lp_${column}`, kind: 'aggregation', function: 'sum', table: 'fact_landing_page_performance', column, time_column: 'activity_date' });

      const client = await connectedClient(rawKey);
      try {
        expect(JSON.parse(textOfResult(await client.callTool({ name: 'register_metric', arguments: { ...lpAggregation('visitors'), unit: 'count' } })))).toMatchObject({ unit: 'count' });
        await client.callTool({ name: 'register_metric', arguments: lpAggregation('conversions') });
        const rate = await client.callTool({
          name: 'register_metric',
          arguments: { name: 'lp_conversion_rate', kind: 'formula', formula: 'lp_conversions / lp_visitors', unit: 'ratio' },
        });
        expect(JSON.parse(textOfResult(rate))).toMatchObject({ name: 'lp_conversion_rate', version: 1, unit: 'ratio' });

        const refused = await client.callTool({ name: 'register_metric', arguments: { ...lpAggregation('bounces'), unit: 'fraction' } });
        expect(refused.isError).toBe(true);
        expect(textOfResult(refused)).toContain('Unknown metric unit "fraction"');

        const catalog = JSON.parse(textOfResult(await client.callTool({ name: 'list_metrics', arguments: {} }))) as { metrics: Array<{ name: string; unit?: string }> };
        expect(Object.fromEntries(catalog.metrics.map((metric) => [metric.name, metric.unit ?? null]))).toEqual({
          lp_conversion_rate: 'ratio',
          lp_conversions: null,
          lp_visitors: 'count',
        });
        expect(JSON.parse(textOfResult(await client.callTool({ name: 'describe_metric', arguments: { name: 'lp_conversion_rate' } })))).toMatchObject({ unit: 'ratio' });

        // An evolve that omits the unit keeps it.
        const evolved = await client.callTool({ name: 'evolve_metric', arguments: { name: 'lp_conversion_rate', kind: 'formula', formula: 'lp_conversions / lp_visitors' } });
        expect(JSON.parse(textOfResult(evolved))).toMatchObject({ version: 2, unit: 'ratio' });
        const versions = JSON.parse(textOfResult(await client.callTool({ name: 'list_metric_versions', arguments: { name: 'lp_conversion_rate' } }))) as {
          versions: Array<{ unit: string | null }>;
        };
        expect(versions.versions.map((version) => version.unit)).toEqual(['ratio', 'ratio']);

        const warehouse: WarehouseQueryExecutor = { execute: () => Promise.resolve([{ bucket_date: '2026-09-19', lp_conversion_rate: 0.5, lp_visitors: 10 }]) };
        mockedQueryMetrics.mockImplementationOnce((params) => realQueryMetrics({ ...params, executor: warehouse, cache: new InMemoryMetricQueryResultCache() }));
        const queried = await client.callTool({
          name: 'query_metric',
          arguments: { metric: ['lp_conversion_rate', 'lp_visitors'], time: { start: '2026-09-19', end: '2026-09-19', grain: 'day' } },
        });
        expect(JSON.parse(textOfResult(queried))).toMatchObject({ units: { lp_conversion_rate: 'ratio', lp_visitors: 'count' } });

        // "Lift conversion to 8%" with target 8 against a 0-1 ratio is refused, naming the fraction meant.
        const goalArgs = {
          name: 'Lift landing page conversion to 8%',
          metric_name: 'lp_conversion_rate',
          direction: 'maximize',
          start_date: '2026-09-01',
          deadline: '2026-12-31',
          rhythm: 'even',
          owner_person_id: person.id,
        };
        const badGoal = await client.callTool({ name: 'create_goal', arguments: { ...goalArgs, target_value: 8 } });
        expect(badGoal.isError).toBe(true);
        expect(textOfResult(badGoal)).toContain('For 8%, use 0.08.');
        expect((await client.callTool({ name: 'create_goal', arguments: { ...goalArgs, target_value: 0.08 } })).isError).not.toBe(true);

        const goals = JSON.parse(textOfResult(await client.callTool({ name: 'list_goals', arguments: {} }))) as { goals: Array<Record<string, unknown>> };
        expect(goals.goals).toHaveLength(1);
        expect(goals.goals[0]).toMatchObject({ metric_unit: 'ratio', target_value: 0.08, target_formatted: '8%' });
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

    it('create_segment saves a real "paying, no demo" cross-schema segment via event_conditions (KAN-93)', async () => {
      const { owner, organization, project, rawKey } = await setupProjectWithKey('Act Tools Create Segment Event Condition Org', ['mcp.read', 'dashboards.write']);
      await registerSchemaDefinition({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'entity',
        name: 'customer',
        fields: [
          { name: 'customer_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
          { name: 'is_paying', type: 'boolean', isRequired: true, isPii: false, isIdentityKey: false },
        ],
        createdByUserId: owner.id,
      });
      await registerSchemaDefinition({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'event',
        name: 'demo_event',
        fields: [{ name: 'customer_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true }],
        createdByUserId: owner.id,
      });

      const client = await connectedClient(rawKey);
      try {
        const result = await client.callTool({
          name: 'create_segment',
          arguments: {
            name: 'Paying, no demo',
            schema_name: 'customer',
            filters: [{ field: 'is_paying', op: '=', value: true }],
            event_conditions: [{ kind: 'no_event', schema_name: 'demo_event' }],
          },
        });
        expect(result.isError).not.toBe(true);
        const body = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text) as {
          id: string;
          name: string;
          eventConditions: Array<{ kind: string; schemaName: string }>;
        };
        expect(body.name).toBe('Paying, no demo');
        expect(body.eventConditions).toEqual([{ kind: 'no_event', schemaName: 'demo_event' }]);
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

  /*
    KAN-199, reported by EasySign: query_funnel returned a bare {"steps":[]} for a project that had
    never confirmed a funnel, and no MCP tool could confirm one - the only way was the web onboarding
    wizard, which an API-key integrator never opens. So the integrator had no funnel, and nothing said
    why.
  */
  describe('KAN-199 set_funnel + an honest query_funnel', () => {
    const EASYSIGN_FUNNEL = ['touchpoint', 'signup', 'document_created', 'document_sent', 'document_signed'];
    const textOf = (result: Awaited<ReturnType<Client['callTool']>>): string => (result.content as Array<{ text: string }>)[0].text;

    async function setupEasySignProject(orgName: string, scopes: Parameters<typeof setupProjectWithKey>[1]) {
      const setup = await setupProjectWithKey(orgName, scopes);
      for (const name of EASYSIGN_FUNNEL) {
        await registerSchemaDefinition({
          organizationId: setup.organization.id,
          projectId: setup.project.id,
          kind: 'event',
          name,
          fields: [{ name: 'plan', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
          createdByUserId: setup.owner.id,
        });
      }
      return setup;
    }

    it('query_funnel says no funnel is defined, and how to define one, instead of a bare empty list', async () => {
      const { rawKey } = await setupProjectWithKey('Funnel Undefined Org');
      const client = await connectedClient(rawKey);
      try {
        const result = await client.callTool({ name: 'query_funnel', arguments: {} });
        expect(result.isError ?? false).toBe(false);
        const body = JSON.parse(textOf(result)) as { status: string; steps: unknown[]; message: string };
        expect(body.status).toBe('no_funnel_defined');
        expect(body.steps).toEqual([]);
        expect(body.message).toContain('set_funnel');
        expect(body.message).toContain('onboarding wizard');
      } finally {
        await client.close();
      }
    });

    it('a dry run needs only mcp.read, reports the resolved funnel, and writes nothing', async () => {
      const { organization, project, rawKey } = await setupEasySignProject('Funnel Dry Run Org', ['mcp.read']);
      const client = await connectedClient(rawKey);
      try {
        const result = await client.callTool({ name: 'set_funnel', arguments: { steps: EASYSIGN_FUNNEL, dry_run: true } });
        expect(result.isError ?? false).toBe(false);
        const body = JSON.parse(textOf(result)) as { dry_run: boolean; saved: boolean; would_set: Array<{ order: number; event_schema_name: string; stage_key: string }>; previous_steps: unknown[]; changed: boolean };
        expect(body).toMatchObject({ dry_run: true, saved: false, previous_steps: [], changed: true });
        expect(body.would_set.map((step) => step.event_schema_name)).toEqual(EASYSIGN_FUNNEL);
        expect(body.would_set.map((step) => step.order)).toEqual([0, 1, 2, 3, 4]);
        expect(body.would_set[1].stage_key).toBe('signup');

        expect(await getOnboardingState(organization.id, project.id)).toBeNull();
        expect(JSON.parse(textOf(await client.callTool({ name: 'query_funnel', arguments: {} }))).status).toBe('no_funnel_defined');
      } finally {
        await client.close();
      }
    });

    it('refuses to commit without project.configure, and saves nothing', async () => {
      const { organization, project, rawKey } = await setupEasySignProject('Funnel No Scope Org', ['mcp.read', 'schema.write', 'dashboards.write']);
      const client = await connectedClient(rawKey);
      try {
        const result = await client.callTool({ name: 'set_funnel', arguments: { steps: EASYSIGN_FUNNEL } });
        expect(result.isError).toBe(true);
        expect(textOf(result)).toContain('project.configure');
        expect(await getOnboardingState(organization.id, project.id)).toBeNull();
      } finally {
        await client.close();
      }
    });

    it('commits with project.configure into the same storage the onboarding wizard uses, audited, and query_funnel then counts it', async () => {
      const { organization, project, rawKey } = await setupEasySignProject('Funnel Commit Org', ['mcp.read', 'project.configure']);
      const client = await connectedClient(rawKey);
      try {
        const result = await client.callTool({
          name: 'set_funnel',
          arguments: { steps: [{ event_schema_name: 'touchpoint', stage_key: 'awareness' }, ...EASYSIGN_FUNNEL.slice(1)] },
        });
        expect(result.isError ?? false).toBe(false);
        const body = JSON.parse(textOf(result)) as { saved: boolean; steps: Array<{ event_schema_name: string; stage_key: string }>; previous_steps: unknown[]; changed: boolean };
        expect(body).toMatchObject({ saved: true, previous_steps: [], changed: true });
        expect(body.steps.map((step) => step.event_schema_name)).toEqual(EASYSIGN_FUNNEL);
        expect(body.steps[0].stage_key).toBe('awareness');

        // The wizard's own singleton - what the web onboarding page and Funnel page read.
        const state = await getOnboardingState(organization.id, project.id);
        expect(state?.funnel_steps.map((step) => step.eventSchemaName)).toEqual(EASYSIGN_FUNNEL);
        expect(state?.funnel_steps.map((step) => step.order)).toEqual([0, 1, 2, 3, 4]);

        const entries = await listAuditLogEntriesForOrg(organization.id);
        expect(entries.find((entry) => entry.action === 'funnel.set')).toMatchObject({ actor_type: 'api_key', project_id: project.id });

        // query_funnel now reads the saved funnel. There is no warehouse in this environment
        // (KAN-18), so counting it fails - but the failure names the funnel it tried to count,
        // rather than reporting "no funnel".
        const query = await client.callTool({ name: 'query_funnel', arguments: {} });
        expect(query.isError).toBe(true);
        expect(textOf(query)).toContain('The confirmed funnel is: touchpoint -> signup -> document_created -> document_sent -> document_signed.');
        expect(textOf(query)).not.toContain('no_funnel_defined');

        // Re-running the same funnel is reported as unchanged, with the previous funnel echoed back.
        const again = JSON.parse(textOf(await client.callTool({ name: 'set_funnel', arguments: { steps: EASYSIGN_FUNNEL.map((name, index) => (index === 0 ? { event_schema_name: name, stage_key: 'awareness' } : name)), dry_run: true } }))) as { changed: boolean; previous_steps: unknown[] };
        expect(again.changed).toBe(false);
        expect(again.previous_steps).toHaveLength(5);
      } finally {
        await client.close();
      }
    });

    /*
      B21, reported by EasySign: set_funnel takes snake_case (event_schema_name) but query_funnel returned
      camelCase (eventSchemaName), so a funnel read from one tool could not be handed to the other.
      B20 in the same report: the counts were events per step, not people through the steps in order.
    */
    it("query_funnel's steps are snake_case people counts that feed straight back into set_funnel", async () => {
      const { rawKey } = await setupEasySignProject('Funnel Round Trip Org', ['mcp.read', 'project.configure']);
      const client = await connectedClient(rawKey);
      try {
        expect((await client.callTool({ name: 'set_funnel', arguments: { steps: EASYSIGN_FUNNEL } })).isError ?? false).toBe(false);

        // EasySign dev's real sequential counts (proven on DuckDB and BigQuery for B20).
        const warehouse = { calls: [] as string[], execute(query: { sql: string }) {
          this.calls.push(query.sql);
          return Promise.resolve([0, 1, 2, 3, 4].map((stepIndex) => ({ step_index: stepIndex, people_count: stepIndex === 0 ? 4 : 2 })));
        } };
        nextQueryFunnelUsesWarehouse(warehouse);
        const query = await client.callTool({ name: 'query_funnel', arguments: {} });
        expect(query.isError ?? false).toBe(false);
        const body = JSON.parse(textOf(query)) as { steps: Array<Record<string, unknown>> };
        expect(warehouse.calls[0]).toContain('LEFT JOIN bridge_identity');

        expect(body.steps.map((step) => [step.event_schema_name, step.step_order, step.people_count, step.conversion_rate_from_first, step.conversion_rate_from_previous])).toEqual([
          ['touchpoint', 0, 4, 1, 1],
          ['signup', 1, 2, 0.5, 0.5],
          ['document_created', 2, 2, 0.5, 1],
          ['document_sent', 3, 2, 0.5, 1],
          ['document_signed', 4, 2, 0.5, 1],
        ]);
        expect(body.steps[0]).toMatchObject({ stage_key: expect.any(String) });
        // Deprecated camelCase duplicates, kept for one release.
        expect(body.steps[1]).toMatchObject({ eventSchemaName: 'signup', stageKey: body.steps[1].stage_key, stepOrder: 1, customerCount: 2, conversionRateFromFirst: 0.5 });

        // The round trip: query_funnel's own step objects, unmodified, are a valid set_funnel input.
        const roundTrip = await client.callTool({ name: 'set_funnel', arguments: { steps: body.steps, dry_run: true } });
        expect(roundTrip.isError ?? false).toBe(false);
        const preview = JSON.parse(textOf(roundTrip)) as { would_set: Array<{ event_schema_name: string; stage_key: string }>; changed: boolean };
        expect(preview.would_set.map((step) => step.event_schema_name)).toEqual(EASYSIGN_FUNNEL);
        expect(preview.would_set.map((step) => step.stage_key)).toEqual(body.steps.map((step) => step.stage_key));
        expect(preview.changed).toBe(false);
      } finally {
        await client.close();
      }
    });

    it('set_funnel accepts camelCase step objects too, snake_case winning when both are given', async () => {
      const { rawKey } = await setupEasySignProject('Funnel Camel Case Org', ['mcp.read']);
      const client = await connectedClient(rawKey);
      try {
        const result = await client.callTool({
          name: 'set_funnel',
          arguments: {
            steps: [
              { eventSchemaName: 'touchpoint', stageKey: 'awareness' },
              { event_schema_name: 'signup', eventSchemaName: 'document_sent', stage_key: 'signup', stageKey: 'other' },
              'document_signed',
            ],
            dry_run: true,
          },
        });
        expect(result.isError ?? false).toBe(false);
        const preview = JSON.parse(textOf(result)) as { would_set: Array<{ event_schema_name: string; stage_key: string }> };
        expect(preview.would_set.map((step) => [step.event_schema_name, step.stage_key])).toEqual([
          ['touchpoint', 'awareness'],
          ['signup', 'signup'],
          ['document_signed', expect.any(String)],
        ]);
      } finally {
        await client.close();
      }
    });

    it.each([
      ['an unknown schema', ['touchpoint', 'signup', 'no_such_event'], '"no_such_event" is not a registered event schema'],
      ['a duplicate step', ['signup', 'document_sent', 'signup'], '"signup" appears more than once (steps 1 and 3)'],
      ['too few steps', ['signup'], 'at least 2 steps; got 1'],
      ['an unknown stage key', ['touchpoint', { event_schema_name: 'signup', stage_key: 'bogus' }], 'stage key "bogus"'],
    ])('refuses %s with a specific reason, the accepted names, and no write', async (_label, steps, reason) => {
      const { organization, project, rawKey } = await setupEasySignProject(`Funnel Invalid Org ${_label}`, ['mcp.read', 'project.configure']);
      const client = await connectedClient(rawKey);
      try {
        for (const dryRun of [true, false]) {
          const result = await client.callTool({ name: 'set_funnel', arguments: { steps, ...(dryRun ? { dry_run: true } : {}) } });
          expect(result.isError).toBe(true);
          expect(textOf(result)).toContain(reason);
          expect(textOf(result)).toContain('Registered event schemas you can use: document_created, document_sent, document_signed, signup, touchpoint.');
          expect(textOf(result)).toContain('Nothing was saved.');
        }
        expect(await getOnboardingState(organization.id, project.id)).toBeNull();
      } finally {
        await client.close();
      }
    });

    it("is isolated: a key can neither build a funnel from another project's schemas nor touch another project's funnel", async () => {
      const projectA = await setupEasySignProject('Funnel Isolation Org A', ['mcp.read', 'project.configure']);
      const projectB = await setupProjectWithKey('Funnel Isolation Org B', ['mcp.read']);
      for (const name of ['b_only_start', 'b_only_end']) {
        await registerSchemaDefinition({
          organizationId: projectB.organization.id,
          projectId: projectB.project.id,
          kind: 'event',
          name,
          fields: [{ name: 'plan', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
          createdByUserId: projectB.owner.id,
        });
      }

      const client = await connectedClient(projectA.rawKey);
      try {
        const foreign = await client.callTool({ name: 'set_funnel', arguments: { steps: ['b_only_start', 'b_only_end'] } });
        expect(foreign.isError).toBe(true);
        expect(textOf(foreign)).toContain('"b_only_start" is not a registered event schema');

        expect((await client.callTool({ name: 'set_funnel', arguments: { steps: ['signup', 'document_signed'] } })).isError ?? false).toBe(false);
      } finally {
        await client.close();
      }
      expect(await getOnboardingState(projectB.organization.id, projectB.project.id)).toBeNull();

      const clientB = await connectedClient(projectB.rawKey);
      try {
        expect(JSON.parse(textOf(await clientB.callTool({ name: 'query_funnel', arguments: {} }))).status).toBe('no_funnel_defined');
      } finally {
        await clientB.close();
      }
    });
  });

  describe('KAN-202 I3 validate_records', () => {
    it("checks records against the caller project's own schemas and stores nothing", async () => {
      const a = await setupProjectWithKey('Validate Records Org A');
      const b = await setupProjectWithKey('Validate Records Org B');
      // Only B registers "signup"; A's key must be judged against A's registry.
      await registerSchemaDefinition({ organizationId: b.organization.id, projectId: b.project.id, kind: 'event', name: 'signup', fields: [{ name: 'plan', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }], createdByUserId: b.owner.id });
      const records = [{ event_id: 'e1', event: 'signup', ts: '2026-09-25T10:00:00Z', properties: { plan: 'free', coupon: 'X' } }];

      const client = await connectedClient(b.rawKey);
      try {
        const result = await client.callTool({ name: 'validate_records', arguments: { kind: 'event', records } });
        expect(JSON.parse((result.content as Array<{ text: string }>)[0].text)).toMatchObject({ total: 1, invalid: 1, records: [{ client_id: 'e1', reasons: ['unregistered_field:coupon'] }] });
        const missingType = await client.callTool({ name: 'validate_records', arguments: { kind: 'entity', records: [{ id: 'c1' }] } });
        expect(missingType.isError).toBe(true);
      } finally {
        await client.close();
      }

      const clientA = await connectedClient(a.rawKey);
      try {
        const result = await clientA.callTool({ name: 'validate_records', arguments: { kind: 'event', records } });
        expect(JSON.parse((result.content as Array<{ text: string }>)[0].text).records[0].reasons).toEqual(['schema_not_registered:signup']);
      } finally {
        await clientA.close();
      }
      expect(await listQuarantinedRecordsForProject(b.organization.id, b.project.id, 10)).toEqual([]);
    });
  });

  describe('KAN-197 setup tools: get_setup_health + audit_installation_gaps', () => {
    type SetupHealthBody = { environment: string; requirements: Array<{ id: string; status: string; detail: string }> };
    type GapsBody = {
      environment: string;
      gaps: Array<{ requirement_id: string; status: string; impact_summary: string; how_to_fix: Array<{ web_page_url?: string; api_endpoint?: string; mcp_tool?: string }> }>;
      connected: Array<{ requirement_id: string; schemas: string[] }>;
    };

    async function callJson<T>(rawKey: string, name: string, args: Record<string, unknown> = {}): Promise<T> {
      const client = await connectedClient(rawKey);
      try {
        const result = await client.callTool({ name, arguments: args });
        expect(result.isError ?? false).toBe(false);
        return JSON.parse((result.content as Array<{ text: string }>)[0].text) as T;
      } finally {
        await client.close();
      }
    }

    async function registerEvent(organizationId: string, projectId: string, ownerId: string, name: string) {
      await registerSchemaDefinition({
        organizationId,
        projectId,
        kind: 'event',
        name,
        fields: [{ name: 'plan', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
        createdByUserId: ownerId,
      });
    }

    function eventRecord(name: string) {
      return { event_id: unique('evt'), event: name, ts: '2026-09-25T10:00:00Z', properties: { plan: 'free' } };
    }

    it("reads the key's own environment by default, judges each environment on its own records, and never sees another project", async () => {
      const a = await setupProjectWithKey('Setup Tools Org A');
      const b = await setupProjectWithKey('Setup Tools Org B');
      await registerEvent(a.organization.id, a.project.id, a.owner.id, 'signup');
      await registerEvent(b.organization.id, b.project.id, b.owner.id, 'signup');
      await registerEvent(b.organization.id, b.project.id, b.owner.id, 'subscription_state_change');
      // A: signups flow in dev only. B: signups and (non-Stripe) billing flow in prod.
      await ingestBatch({ organizationId: a.organization.id, projectId: a.project.id, environmentId: a.devEnvironmentId, input: { kind: 'event', records: [eventRecord('signup')] } });
      await ingestBatch({
        organizationId: b.organization.id,
        projectId: b.project.id,
        environmentId: b.environmentId,
        input: { kind: 'event', records: [eventRecord('signup'), eventRecord('subscription_state_change')] },
      });
      const { rawKey: aDevKey } = await mintApiKey({
        organizationId: a.organization.id,
        projectId: a.project.id,
        environmentId: a.devEnvironmentId,
        name: 'e2e dev setup key',
        scopes: ['mcp.read'],
        createdByUserId: a.owner.id,
      });

      const statusOf = (body: SetupHealthBody, id: string) => body.requirements.find((requirement) => requirement.id === id)?.status;

      const aDev = await callJson<SetupHealthBody>(aDevKey, 'get_setup_health');
      expect(aDev.environment).toBe('dev');
      expect(statusOf(aDev, 'signups')).toBe('connected');
      expect(statusOf(aDev, 'billing')).toBe('gap');

      // The prod-bound key: dev's signups do not count here.
      const aProd = await callJson<SetupHealthBody & { environments: Array<{ environment: string }> }>(a.rawKey, 'get_setup_health');
      expect(aProd.environment).toBe('prod');
      expect(statusOf(aProd, 'signups')).toBe('gap');
      // KAN-28: a key sees only its own environment - not in detail, not in the summary.
      expect(aProd.environments.map((environment) => environment.environment)).toEqual(['prod']);
      const client = await connectedClient(a.rawKey);
      try {
        const crossEnvironment = await client.callTool({ name: 'get_setup_health', arguments: { environment: 'dev' } });
        expect(crossEnvironment.isError).toBe(true);
        expect((crossEnvironment.content as Array<{ text: string }>)[0].text).toContain('bound to the "prod" environment');
      } finally {
        await client.close();
      }
      expect(statusOf(await callJson<SetupHealthBody>(aDevKey, 'get_setup_health', { environment: 'dev' }), 'signups')).toBe('connected');

      // B's prod billing is B's alone, whatever A's call smuggles in.
      const smuggled = await callJson<SetupHealthBody>(a.rawKey, 'get_setup_health', { organizationId: b.organization.id, projectId: b.project.id });
      expect(statusOf(smuggled, 'billing')).toBe('gap');
      const bProd = await callJson<SetupHealthBody>(b.rawKey, 'get_setup_health');
      expect(statusOf(bProd, 'billing')).toBe('connected');
      expect(statusOf(bProd, 'signups')).toBe('connected');
    });

    it("audit_installation_gaps names each gap's cost and real steps, linked into the caller's own project only", async () => {
      const a = await setupProjectWithKey('Setup Gaps Org A');
      const b = await setupProjectWithKey('Setup Gaps Org B');
      const body = await callJson<GapsBody>(a.rawKey, 'audit_installation_gaps');

      expect(body.environment).toBe('prod');
      expect(body.gaps.map((gap) => gap.requirement_id).sort()).toEqual(['ad_spend', 'billing', 'customer_profiles', 'landing_page_attribution', 'product_usage', 'signups']);
      const steps = body.gaps.flatMap((gap) => gap.how_to_fix);
      expect(steps.length).toBeGreaterThan(0);
      for (const gap of body.gaps) {
        // B3: an impact is a sentence, not a translation key such as "SetupRequirements.webSdkImpact".
        expect(gap.impact_summary).not.toMatch(/^[A-Z][A-Za-z]*\.[A-Za-z]+$/);
        expect(gap.impact_summary.split(' ').length).toBeGreaterThan(8);
      }
      for (const step of steps) {
        if (step.web_page_url) {
          expect(step.web_page_url).toContain(`/orgs/${a.organization.id}/projects/${a.project.id}/`);
        }
      }
      expect(JSON.stringify(body)).not.toContain(b.project.id);
      // An environment-bound key cannot see the other environments, so it must not claim "connected nowhere else".
      for (const gap of body.gaps as Array<{ connected_in_other_environments?: unknown }>) {
        expect(gap.connected_in_other_environments).toBeNull();
      }
    });

    it('refuses an environment name the project does not have, rather than reporting on another one', async () => {
      const { rawKey } = await setupProjectWithKey('Setup Env Org');
      const client = await connectedClient(rawKey);
      try {
        const result = await client.callTool({ name: 'get_setup_health', arguments: { environment: 'qa' } });
        expect(result.isError).toBe(true);
      } finally {
        await client.close();
      }
    });
  });

  describe('KAN-77 cross-project isolation via MCP', () => {
    it("list_insights never surfaces another project's win events — the AC's own \"project-A token cannot list/query anything of project B\"", async () => {
      const projectA = await setupProjectWithKey('MCP Isolation Org A');
      const projectB = await setupProjectWithKey('MCP Isolation Org B');
      const winA = await seedWinEvent(projectA.organization.id, projectA.project.id, projectA.environmentId, 'Project A win');
      const winB = await seedWinEvent(projectB.organization.id, projectB.project.id, projectB.environmentId, 'Project B win');

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

    /**
     * KAN-99, the same isolation one level down: a key bound to one environment must not see wins
     * another environment's key produced in the same project. A `gos_test_` key's synthetic
     * signup used to appear to a `gos_live_` caller as a real win.
     */
    it("list_insights never surfaces another environment's win events in the same project", async () => {
      const project = await setupProjectWithKey('MCP Env Isolation Org');
      const prodWin = await seedWinEvent(project.organization.id, project.project.id, project.environmentId, 'Prod win');
      const devWin = await seedWinEvent(project.organization.id, project.project.id, project.devEnvironmentId, 'Dev win');
      // A dev-bound key, deliberately: a prod-bound key would pass even if the handler ignored the
      // key's environment, because the default it would fall back to is also prod.
      const { rawKey: devKey } = await mintApiKey({
        organizationId: project.organization.id,
        projectId: project.project.id,
        environmentId: project.devEnvironmentId,
        name: 'e2e dev mcp key',
        scopes: ['mcp.read'],
        createdByUserId: project.owner.id,
      });

      const idsFor = async (rawKey: string) => {
        const client = await connectedClient(rawKey);
        try {
          const result = await client.callTool({ name: 'list_insights', arguments: {} });
          expect(result.isError).not.toBe(true);
          const body = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text) as { insights: Array<{ id: string }> };
          return body.insights.map((insight) => insight.id);
        } finally {
          await client.close();
        }
      };

      expect(await idsFor(project.rawKey)).toEqual([prodWin.id]);
      expect(await idsFor(devKey)).toEqual([devWin.id]);
    });

    it('no tool argument can override the credential-derived organizationId/projectId scope', async () => {
      const projectA = await setupProjectWithKey('MCP Isolation Args Org A');
      const projectB = await setupProjectWithKey('MCP Isolation Args Org B');
      const winB = await seedWinEvent(projectB.organization.id, projectB.project.id, projectB.environmentId, 'Project B win');

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
