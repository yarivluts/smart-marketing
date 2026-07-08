import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  connectFirestoreOrm,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  evolveMetricDefinition,
  mintApiKey,
  registerMetricDefinition,
  setProjectCostQuota,
} from '@growthos/firebase-orm-models';
import { AppModule } from '../app.module';

/**
 * Real Firestore-emulator-backed e2e coverage for KAN-42's metrics query API
 * — the same posture `ingest.controller.e2e.spec.ts` already established.
 * There is no real BigQuery project in this environment (KAN-18), so
 * `POST /v1/metrics/query` against a registered metric legitimately returns
 * 503 here — that's real, correct behavior this suite asserts on, not a gap
 * in the test; `metrics-query.emulator.test.ts` (in
 * `@growthos/firebase-orm-models`) covers the actual-execution happy path
 * with an injected fake warehouse executor.
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

async function setupProjectWithKey(orgName: string, scopes: ('ingest.write' | 'metrics.write')[] = ['metrics.write']) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const prodEnvironment = environments.find((e) => e.name === 'prod')!;
  const { rawKey } = await mintApiKey({
    organizationId: organization.id,
    projectId: project.id,
    environmentId: prodEnvironment.id,
    name: 'e2e key',
    scopes,
    createdByUserId: owner.id,
  });
  return { owner, organization, project, rawKey };
}

const VALID_QUERY_BODY = { metric: 'ad_spend', time: { start: '2026-01-01', end: '2026-01-07', grain: 'day' } };

describe('MetricsController (e2e)', () => {
  it('rejects (401) a request with no Authorization header', async () => {
    const res = await fetch(`${baseUrl}/v1/metrics/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_QUERY_BODY),
    });
    expect(res.status).toBe(401);
  });

  it('rejects (401) an unknown key', async () => {
    const res = await fetch(`${baseUrl}/v1/metrics/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer gos_live_not-a-real-key' },
      body: JSON.stringify(VALID_QUERY_BODY),
    });
    expect(res.status).toBe(401);
  });

  it('rejects (403) a key that lacks the metrics.write scope', async () => {
    const { rawKey } = await setupProjectWithKey('Scope Org', ['ingest.write']);
    const res = await fetch(`${baseUrl}/v1/metrics/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify(VALID_QUERY_BODY),
    });
    expect(res.status).toBe(403);
  });

  it('rejects (400) a malformed body', async () => {
    const { rawKey } = await setupProjectWithKey('Malformed Org');
    const res = await fetch(`${baseUrl}/v1/metrics/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify({ metric: 'ad_spend' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects (400) a query naming a metric that was never registered', async () => {
    const { rawKey } = await setupProjectWithKey('Unregistered Org');
    const res = await fetch(`${baseUrl}/v1/metrics/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify(VALID_QUERY_BODY),
    });
    expect(res.status).toBe(400);
  });

  it('accepts (compiles) a valid query for a registered metric but returns 503 — no warehouse is configured in this environment', async () => {
    const { organization, project, owner, rawKey } = await setupProjectWithKey('Compile Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });

    const res = await fetch(`${baseUrl}/v1/metrics/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify(VALID_QUERY_BODY),
    });
    expect(res.status).toBe(503);
  });

  it('rejects (400) a query breaking down by a dimension the metric does not declare (a compiler-level MetricCompilerError, not a service-layer one)', async () => {
    const { organization, project, owner, rawKey } = await setupProjectWithKey('Bad Dimension Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });

    const res = await fetch(`${baseUrl}/v1/metrics/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify({ ...VALID_QUERY_BODY, dimensions: ['channel'] }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /v1/metrics lists only active-version metrics registered in the caller\'s own project', async () => {
    const { organization, project, owner, rawKey } = await setupProjectWithKey('Catalog Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: ['channel'],
      createdByUserId: owner.id,
    });

    const res = await fetch(`${baseUrl}/v1/metrics`, { headers: { Authorization: `Bearer ${rawKey}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { metrics: { name: string; version: number; dimensions: string[] }[] };
    expect(body.metrics).toEqual([{ name: 'ad_spend', version: 1, definitionKind: 'aggregation', dimensions: ['channel'] }]);
  });

  it("GET /v1/metrics doesn't leak another project's registered metrics", async () => {
    const first = await setupProjectWithKey('Isolation Org A');
    const second = await setupProjectWithKey('Isolation Org B');
    await registerMetricDefinition({
      organizationId: first.organization.id,
      projectId: first.project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: [],
      createdByUserId: first.owner.id,
    });

    const res = await fetch(`${baseUrl}/v1/metrics`, { headers: { Authorization: `Bearer ${second.rawKey}` } });
    const body = (await res.json()) as { metrics: unknown[] };
    expect(body.metrics).toEqual([]);
  });

  it('GET /v1/metrics/{name} returns the active definition plus formula lineage', async () => {
    const { organization, project, owner, rawKey } = await setupProjectWithKey('Detail Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
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
      name: 'cost_per_signup',
      definition: { kind: 'formula', formula: 'ad_spend / signups' },
      dimensions: [],
      createdByUserId: owner.id,
    });
    await evolveMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'cost_per_signup',
      definition: { kind: 'formula', formula: 'ad_spend / signups' },
      dimensions: ['channel'],
      createdByUserId: owner.id,
    });

    const res = await fetch(`${baseUrl}/v1/metrics/cost_per_signup`, { headers: { Authorization: `Bearer ${rawKey}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: number; formula: string; dependsOn: string[]; dimensions: string[] };
    expect(body.version).toBe(2);
    expect(body.formula).toBe('ad_spend / signups');
    expect(body.dependsOn.sort()).toEqual(['ad_spend', 'signups']);
    expect(body.dimensions).toEqual(['channel']);
  });

  it('returns (404) GET /v1/metrics/{name} for a name never registered in the project', async () => {
    const { rawKey } = await setupProjectWithKey('Detail Missing Org');
    const res = await fetch(`${baseUrl}/v1/metrics/does_not_exist`, { headers: { Authorization: `Bearer ${rawKey}` } });
    expect(res.status).toBe(404);
  });

  it('returns (429) once the project has spent its KAN-39 daily query quota', async () => {
    const { organization, project, owner, rawKey } = await setupProjectWithKey('Quota Org');
    await registerMetricDefinition({
      organizationId: organization.id,
      projectId: project.id,
      name: 'ad_spend',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', timeColumn: 'date', filters: [] } },
      dimensions: [],
      createdByUserId: owner.id,
    });
    await setProjectCostQuota({ organizationId: organization.id, projectId: project.id, dailyQueryLimit: 1, labels: {}, setByUserId: owner.id });

    // First attempt clears the quota check but 503s (no real warehouse) — that attempt still counts.
    const first = await fetch(`${baseUrl}/v1/metrics/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify(VALID_QUERY_BODY),
    });
    expect(first.status).toBe(503);

    const second = await fetch(`${baseUrl}/v1/metrics/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify(VALID_QUERY_BODY),
    });
    expect(second.status).toBe(429);
  });
});
