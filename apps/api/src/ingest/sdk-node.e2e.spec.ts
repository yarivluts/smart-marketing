import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { GrowthOS, createRelayHandler, eventId } from '@growthos/node';
import {
  connectFirestoreOrmAdmin,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  mintApiKey,
  registerSchemaDefinition,
} from '@growthos/firebase-orm-models';
import { AppModule } from '../app.module';
import { configureBrowserIngest } from '../browser-ingest.setup';

/**
 * The published Node SDK (@growthos/node) against the real API over HTTP: what the library sends
 * is what the API accepts, and what the API answers is what the library reports - so the two
 * cannot drift apart.
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

async function setup() {
  const owner = await ensureUserForFirebaseSession({
    firebaseUid: unique('uid'),
    email: `${unique('owner')}@example.com`,
  });
  const { organization } = await createOrganizationWithOwner({
    name: 'SDK Org',
    ownerUserId: owner.id,
  });
  const { project, environments } = await createProject({
    organizationId: organization.id,
    name: 'Website',
  });
  const prod = environments.find((environment) => environment.name === 'prod')!;
  const register = (
    kind: string,
    name: string,
    fields: { name: string; type: string; isRequired: boolean }[],
  ) =>
    registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind,
      name,
      fields: fields.map((field) => ({ ...field, isPii: false, isIdentityKey: false })),
      createdByUserId: owner.id,
    });
  await register('event', 'signup', [{ name: 'plan', type: 'string', isRequired: true }]);
  await register('event', 'touchpoint', [
    { name: 'utm_source', type: 'string', isRequired: false },
  ]);
  await register('entity', 'customer', [{ name: 'plan', type: 'string', isRequired: false }]);
  const { rawKey } = await mintApiKey({
    organizationId: organization.id,
    projectId: project.id,
    environmentId: prod.id,
    name: 'server',
    scopes: ['ingest.write'],
    createdByUserId: owner.id,
  });
  return { rawKey };
}

describe('@growthos/node against the real API (e2e)', () => {
  it('sends events and customers, reports each quarantined record with its reason, dedups by event id, and verifies the install', async () => {
    const { rawKey } = await setup();
    const growthos = new GrowthOS({ apiKey: rawKey, baseUrl, flushIntervalMs: 0 });
    const signupId = eventId('signup', 'user-1');
    growthos.track({
      event: 'signup',
      eventId: signupId,
      customerId: 'user-1',
      anonId: 'anon-1',
      properties: { plan: 'free' },
    });
    growthos.track({
      event: 'signup',
      eventId: eventId('signup', 'user-2'),
      properties: { plann: 'free' },
    });
    growthos.customer('user-1', { plan: 'free' });
    const first = await growthos.flush();
    expect(first.accepted).toBe(2);
    expect(first.quarantined).toBe(1);
    expect(first.ok).toBe(false);
    expect(first.rejected[0].reasons.join(' ')).toMatch(/plan/);

    // The same event again (a retried trigger): a duplicate, not a second signup.
    const again = await growthos.sendEvents([
      { event: 'signup', eventId: signupId, customerId: 'user-1', properties: { plan: 'free' } },
    ]);
    expect(again.duplicates).toBe(1);

    const check = await growthos.verify({ expect: ['signup', 'customer', 'document_signed'] });
    expect(check.environment.name).toBe('prod');
    expect(check.report.schemas.map((schema) => [schema.name, schema.status])).toEqual([
      ['signup', 'receiving'],
      ['customer', 'receiving'],
      ['document_signed', 'not_registered'],
    ]);
    expect(check.report.status).toBe('attention');

    const validation = await growthos.validateEvents([{ event: 'nope', eventId: 'v1' }]);
    expect(validation.records[0]).toMatchObject({
      valid: false,
      reasons: ['schema_not_registered:nope'],
    });
  });

  it("relays a page's events with the secret key, dropping names the site did not allow", async () => {
    const { rawKey } = await setup();
    const relay = createRelayHandler({ apiKey: rawKey, baseUrl, allowedEvents: ['touchpoint'] });
    const response = await relay(
      new Request('https://site.example/api/growth', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          batch: [
            {
              event_id: 't1',
              event: 'touchpoint',
              ts: '2026-10-05T10:00:00Z',
              properties: { anon_id: 'a1', utm_source: 'google' },
            },
            {
              event_id: 's1',
              event: 'signup',
              ts: '2026-10-05T10:00:00Z',
              properties: { plan: 'pro' },
            },
          ],
        }),
      }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      accepted: 1,
      quarantined: 0,
      duplicates: 0,
      dropped: 1,
    });
  });
});
