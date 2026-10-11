import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  connectFirestoreOrmAdmin,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  mintApiKey,
  registerSchemaDefinition,
  setApiKeyAllowedOrigins,
} from '@growthos/firebase-orm-models';
import { AppModule } from '../app.module';
import { configureBrowserIngest } from '../browser-ingest.setup';

/**
 * Publishable (browser) keys and the installation check, end to end over real HTTP against the
 * Firestore emulator, with the same browser setup `main.ts` applies (CORS + text/plain bodies).
 */

let app: NestExpressApplication;
let baseUrl: string;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8100';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await connectFirestoreOrmAdmin({ projectId: 'demo-growthos-test' });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
  app.setGlobalPrefix('v1');
  configureBrowserIngest(app);
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

const ORIGIN = 'https://easysign.example';

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Browser Org', ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const prod = environments.find((environment) => environment.name === 'prod')!;
  await registerSchemaDefinition({
    organizationId: organization.id,
    projectId: project.id,
    kind: 'event',
    name: 'cta_click',
    fields: [{ name: 'cta', type: 'string', isRequired: true, isPii: false, isIdentityKey: false }],
    createdByUserId: owner.id,
  });
  const publishable = await mintApiKey({
    organizationId: organization.id,
    projectId: project.id,
    environmentId: prod.id,
    name: 'site',
    // Asked for more, gets only ingest.write: a publishable key is public.
    scopes: ['ingest.write', 'schema.write'],
    kind: 'publishable',
    allowedOrigins: [ORIGIN, 'https://*.easysign.example'],
    createdByUserId: owner.id,
  });
  const secret = await mintApiKey({ organizationId: organization.id, projectId: project.id, environmentId: prod.id, name: 'server', scopes: ['ingest.write'], createdByUserId: owner.id });
  return { owner, organization, project, prod, publishable, secret };
}

const EVENT = { batch: [{ event_id: 'e-1', event: 'cta_click', ts: '2026-10-05T10:00:00Z', properties: { cta: 'hero_signup', anon_id: 'anon-1' } }] };

describe('publishable keys and the installation check (e2e)', () => {
  it('mints a gos_pk_ key that carries only ingest.write', async () => {
    const { publishable } = await setup();
    expect(publishable.rawKey.startsWith('gos_pk_live_')).toBe(true);
    expect(publishable.apiKey.scopes).toEqual(['ingest.write']);
    expect(publishable.apiKey.allowed_origins).toEqual([ORIGIN, 'https://*.easysign.example']);
  });

  it('answers the CORS preflight of the browser routes only', async () => {
    const preflight = await fetch(`${baseUrl}/v1/ingest/events`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization');
    const entities = await fetch(`${baseUrl}/v1/ingest/entities`, { method: 'OPTIONS', headers: { Origin: ORIGIN } });
    expect(entities.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('accepts events from an allowed origin - JSON with a header, or text/plain with ?key= as sendBeacon sends it', async () => {
    const { publishable } = await setup();
    const json = await fetch(`${baseUrl}/v1/ingest/events`, { method: 'POST', headers: { Authorization: `Bearer ${publishable.rawKey}`, 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(EVENT) });
    expect(json.status).toBe(202);
    expect(json.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(await json.json()).toMatchObject({ accepted: 1 });

    const beacon = await fetch(`${baseUrl}/v1/ingest/events?key=${publishable.rawKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8', Origin: 'https://www.easysign.example' },
      body: JSON.stringify({ batch: [{ ...EVENT.batch[0], event_id: 'e-2' }] }),
    });
    expect(beacon.status).toBe(202);
    expect(await beacon.json()).toMatchObject({ accepted: 1 });
  });

  it('refuses a publishable key from another origin, on any other route, and a secret key in the URL', async () => {
    const { publishable, secret } = await setup();
    const elsewhere = await fetch(`${baseUrl}/v1/ingest/events`, { method: 'POST', headers: { Authorization: `Bearer ${publishable.rawKey}`, 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify(EVENT) });
    expect(elsewhere.status).toBe(403);
    expect(((await elsewhere.json()) as { message: string }).message).toContain('https://evil.example');
    const entities = await fetch(`${baseUrl}/v1/ingest/entities`, { method: 'POST', headers: { Authorization: `Bearer ${publishable.rawKey}`, 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ type: 'customer', records: [{ id: 'c1', attributes: {} }] }) });
    expect(entities.status).toBe(403);
    const leaked = await fetch(`${baseUrl}/v1/ingest/events?key=${secret.rawKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(EVENT) });
    expect(leaked.status).toBe(401);
    const badJson = await fetch(`${baseUrl}/v1/ingest/events?key=${publishable.rawKey}`, { method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: ORIGIN }, body: '{not json' });
    expect(badJson.status).toBe(400);
  });

  it('a changed origin list takes effect on the next request', async () => {
    const { organization, project, owner, publishable } = await setup();
    await setApiKeyAllowedOrigins({ organizationId: organization.id, projectId: project.id, apiKeyId: publishable.apiKey.id, allowedOrigins: ['https://new.example'], actorUserId: owner.id });
    const res = await fetch(`${baseUrl}/v1/ingest/events`, { method: 'POST', headers: { Authorization: `Bearer ${publishable.rawKey}`, 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(EVENT) });
    expect(res.status).toBe(403);
  });

  it('verify: tells a key which project and environment it writes to, and what really arrived for each expected schema', async () => {
    const { project, secret, publishable } = await setup();
    await fetch(`${baseUrl}/v1/ingest/events`, { method: 'POST', headers: { Authorization: `Bearer ${secret.rawKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(EVENT) });
    await fetch(`${baseUrl}/v1/ingest/events`, { method: 'POST', headers: { Authorization: `Bearer ${secret.rawKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ batch: [{ event_id: 'x', event: 'signup', ts: '2026-10-05T10:00:00Z', properties: {} }] }) });

    const res = await fetch(`${baseUrl}/v1/ingest/verify?expect=cta_click,signup,document_signed`, { headers: { Authorization: `Bearer ${secret.rawKey}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { key: { kind: string }; project: { id: string; name: string }; environment: { name: string }; report: { status: string; schemas: { name: string; status: string; quarantineReasons: string[] }[] } };
    expect(body.key.kind).toBe('secret');
    expect(body.project).toEqual({ id: project.id, name: 'Website' });
    expect(body.environment.name).toBe('prod');
    expect(body.report.status).toBe('attention');
    expect(body.report.schemas.map((schema) => [schema.name, schema.status])).toEqual([
      ['cta_click', 'receiving'],
      ['signup', 'quarantined'],
      ['document_signed', 'not_registered'],
    ]);
    expect(body.report.schemas[1].quarantineReasons).toContain('schema_not_registered:signup');

    // A publishable key checks only what it names (default: touchpoint), from its own origin.
    const browser = await fetch(`${baseUrl}/v1/ingest/verify?key=${publishable.rawKey}`, { headers: { Origin: ORIGIN } });
    expect(browser.status).toBe(200);
    const browserBody = (await browser.json()) as { key: { kind: string; allowedOrigins: string[] }; report: { schemas: { name: string }[] } };
    expect(browserBody.key.kind).toBe('publishable');
    expect(browserBody.report.schemas.map((schema) => schema.name)).toEqual(['touchpoint']);
    expect((await fetch(`${baseUrl}/v1/ingest/verify?key=${publishable.rawKey}`, { headers: { Origin: 'https://evil.example' } })).status).toBe(403);
  });
});
