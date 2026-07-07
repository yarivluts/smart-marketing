import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  connectFirestoreOrm,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  InMemoryTokenBucketRateLimiter,
  listApiKeysForProject,
  mintApiKey,
  registerSchemaDefinition,
  revokeApiKey,
} from '@growthos/firebase-orm-models';
import { AppModule } from '../app.module';
import { API_KEY_RATE_LIMITER } from '../authz/api-key-auth.guard';

/**
 * Real Firestore-emulator-backed e2e coverage for KAN-32's ingest API — the
 * same "spin up a real app, hit it with real HTTP, connect to a real
 * emulator" posture `apps/web`'s route tests already use, rather than
 * mocking `@growthos/firebase-orm-models` here: the auth guard + schema
 * validation + dedup interplay is exactly the kind of thing prior stories'
 * PROGRESS.md entries note lint/typecheck alone won't catch.
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

async function setupProjectWithKey(orgName: string, scopes: ('ingest.write' | 'metrics.write')[] = ['ingest.write']) {
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
  return { owner, organization, project, prodEnvironment, rawKey };
}

describe('IngestController (e2e)', () => {
  it('rejects (401) a request with no Authorization header', async () => {
    const res = await fetch(`${baseUrl}/v1/ingest/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch: [] }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects (401) an unknown key', async () => {
    const res = await fetch(`${baseUrl}/v1/ingest/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer gos_live_not-a-real-key' },
      body: JSON.stringify({ batch: [] }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects (403) a key that lacks the ingest.write scope', async () => {
    const { rawKey } = await setupProjectWithKey('Scope Org', ['metrics.write']);
    const res = await fetch(`${baseUrl}/v1/ingest/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify({ batch: [] }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects (401) a revoked key', async () => {
    const { organization, project, owner, rawKey } = await setupProjectWithKey('Revoked Org');
    const minted = await listApiKeysForProject(organization.id, project.id);
    await revokeApiKey({ organizationId: organization.id, projectId: project.id, apiKeyId: minted[0].id, revokedByUserId: owner.id });

    const res = await fetch(`${baseUrl}/v1/ingest/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify({ batch: [] }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects (400) a malformed body', async () => {
    const { rawKey } = await setupProjectWithKey('Malformed Org');
    const res = await fetch(`${baseUrl}/v1/ingest/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify({ notBatch: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('accepts a valid event batch (202 + batch_id) and the batch is queryable per-record via GET /batches/{id}', async () => {
    const { organization, project, owner, rawKey } = await setupProjectWithKey('Full Flow Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'order_completed',
      fields: [{ name: 'net', type: 'number', isRequired: true, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    const postRes = await fetch(`${baseUrl}/v1/ingest/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify({
        batch: [
          { event_id: 'ord_5001-evt', event: 'order_completed', ts: '2026-07-03T10:15:00Z', properties: { net: 349.0 } },
          { event_id: 'ord_5002-evt', event: 'unknown_event', ts: '2026-07-03T10:15:00Z' },
        ],
      }),
    });
    expect(postRes.status).toBe(202);
    const posted = (await postRes.json()) as { batch_id: string; accepted: number; quarantined: number };
    expect(posted.accepted).toBe(1);
    expect(posted.quarantined).toBe(1);

    const getRes = await fetch(`${baseUrl}/v1/ingest/batches/${posted.batch_id}`, {
      headers: { Authorization: `Bearer ${rawKey}` },
    });
    expect(getRes.status).toBe(200);
    const fetched = (await getRes.json()) as { records: { client_id: string; status: string }[] };
    expect(fetched.records).toHaveLength(2);
    expect(fetched.records.find((r) => r.client_id === 'ord_5001-evt')?.status).toBe('accepted');
    expect(fetched.records.find((r) => r.client_id === 'ord_5002-evt')?.status).toBe('quarantined');
  });

  it('returns (404) a batch id scoped to a different project', async () => {
    const first = await setupProjectWithKey('Isolation Org A');
    const second = await setupProjectWithKey('Isolation Org B');
    await registerSchemaDefinition({
      organizationId: first.organization.id,
      projectId: first.project.id,
      kind: 'event',
      name: 'page_view',
      fields: [{ name: 'path', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
      createdByUserId: first.owner.id,
    });

    const postRes = await fetch(`${baseUrl}/v1/ingest/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${first.rawKey}` },
      body: JSON.stringify({ batch: [{ event_id: 'e1', event: 'page_view', ts: '2026-07-03T10:15:00Z' }] }),
    });
    const posted = (await postRes.json()) as { batch_id: string };

    const getRes = await fetch(`${baseUrl}/v1/ingest/batches/${posted.batch_id}`, {
      headers: { Authorization: `Bearer ${second.rawKey}` },
    });
    expect(getRes.status).toBe(404);
  });
});

describe('IngestController (e2e) — per-key rate limiting (KAN-34)', () => {
  // A dedicated app instance with a tiny rate-limit bucket overridden in, so this suite can trip a 429
  // in a handful of requests rather than needing hundreds against the real default capacity — kept
  // separate from the main `app`/`baseUrl` above so this override never affects any other test's key.
  let limitedApp: INestApplication;
  let limitedBaseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_KEY_RATE_LIMITER)
      .useValue(new InMemoryTokenBucketRateLimiter({ capacity: 2, refillPerSecond: 0.001 }))
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

  it('rejects (429) once a key exhausts its bucket, with a Retry-After header', async () => {
    const { rawKey } = await setupProjectWithKey('Rate Limit Org');
    const request = () =>
      fetch(`${limitedBaseUrl}/v1/ingest/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
        body: JSON.stringify({ batch: [] }),
      });

    expect((await request()).status).toBe(400); // capacity 2: first two requests reach the handler...
    expect((await request()).status).toBe(400); // ...and both fail as a 400 (empty batch), not 429.

    const throttled = await request();
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get('retry-after')).toMatch(/^\d+$/);
  });

  it('tracks each key independently — one key exhausting its bucket does not throttle another', async () => {
    const first = await setupProjectWithKey('Rate Limit Isolation Org A');
    const second = await setupProjectWithKey('Rate Limit Isolation Org B');
    const requestWith = (rawKey: string) =>
      fetch(`${limitedBaseUrl}/v1/ingest/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
        body: JSON.stringify({ batch: [] }),
      });

    await requestWith(first.rawKey);
    await requestWith(first.rawKey);
    expect((await requestWith(first.rawKey)).status).toBe(429);

    expect((await requestWith(second.rawKey)).status).toBe(400);
  });
});
