import type { AddressInfo } from 'node:net';
import { randomBytes, createHmac } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  connectFirestoreOrm,
  createHookEndpoint,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  generateLocalKmsKeyRing,
  LocalKmsProvider,
  listHookDeliveriesForProject,
  setHookEndpointSigningSecret,
  type LocalKmsKeyRing,
} from '@growthos/firebase-orm-models';
import { AppModule } from '../app.module';

/**
 * Real Firestore-emulator-backed e2e coverage for KAN-53's inbound hook
 * receiver — same "spin up a real app, hit it with real HTTP" posture
 * `ingest.controller.e2e.spec.ts` establishes, needed here in particular to
 * prove `rawBody: true` actually round-trips through a live HTTP request
 * (a unit test mocking the request object could hide a body-parser
 * misconfiguration that only shows up over real HTTP).
 */

let app: INestApplication;
let baseUrl: string;
let localKeyRing: LocalKmsKeyRing;
let localCurrentKeyId: string;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8100';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await connectFirestoreOrm({ projectId: 'demo-growthos-test', emulatorHost: '127.0.0.1:8100' });

  const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
  localKeyRing = keyRing;
  localCurrentKeyId = currentKeyId;
  // The route's own `getServerKmsProvider()` (`apps/api/src/vault/kms-provider.ts`) reads this same
  // env var — this test's `LocalKmsProvider` (below) must derive from the identical key ring so the
  // encrypted secret it sets up is decryptable by the live app under test.
  process.env.GROWTHOS_VAULT_KEYS = JSON.stringify({
    currentKeyId,
    keys: { [currentKeyId]: keyRing[currentKeyId].toString('base64') },
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ rawBody: true });
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

async function setupProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const prodEnvironment = environments.find((e) => e.name === 'prod')!;
  return { owner, organization, project, prodEnvironment };
}

describe('HooksController (e2e)', () => {
  it('returns (404) an unknown hook id', async () => {
    const res = await fetch(`${baseUrl}/v1/hooks/${randomBytes(16).toString('hex')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ping: true }),
    });
    expect(res.status).toBe(404);
  });

  it('accepts a "none"-mode delivery (202) and lands it verbatim in the review queue', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Hook E2E None Org');
    const endpoint = await createHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Zero-config',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });

    const payload = { order_id: 'ord_1', amount: 42 };
    const res = await fetch(`${baseUrl}/v1/hooks/${endpoint.hook_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { delivery_id: string; status: string; signature_verified: boolean };
    expect(body.status).toBe('pending');
    expect(body.signature_verified).toBe(false);

    const deliveries = await listHookDeliveriesForProject(organization.id, project.id);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].id).toBe(body.delivery_id);
    expect(JSON.parse(deliveries[0].raw_payload)).toEqual(payload);
  });

  it('verifies an hmac_sha256 endpoint over real HTTP, rejecting a bad signature and accepting a correct one', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Hook E2E Hmac Org');
    const endpoint = await createHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Signed',
      signatureMode: 'hmac_sha256',
      signatureHeaderName: 'X-Hub-Signature-256',
      createdByUserId: owner.id,
    });
    await setHookEndpointSigningSecret({
      organizationId: organization.id,
      projectId: project.id,
      hookEndpointId: endpoint.id,
      signingSecret: 'e2e-secret',
      kms: new LocalKmsProvider(localKeyRing, localCurrentKeyId),
      actedByUserId: owner.id,
    });

    const rawBody = JSON.stringify({ ping: true });

    const rejected = await fetch(`${baseUrl}/v1/hooks/${endpoint.hook_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': 'sha256=deadbeef' },
      body: rawBody,
    });
    expect(rejected.status).toBe(401);

    const goodSignature = `sha256=${createHmac('sha256', 'e2e-secret').update(rawBody).digest('hex')}`;
    const accepted = await fetch(`${baseUrl}/v1/hooks/${endpoint.hook_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': goodSignature },
      body: rawBody,
    });
    expect(accepted.status).toBe(202);
    const body = (await accepted.json()) as { signature_verified: boolean };
    expect(body.signature_verified).toBe(true);
  });
});
