import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  computeHookSignature,
  connectFirestoreOrm,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  listHookPayloadsForProject,
  loadLocalKmsKeyRingFromEnv,
  LocalKmsProvider,
  mintHookEndpoint,
  revokeHookEndpoint,
  type KmsProvider,
} from '@growthos/firebase-orm-models';
import { AppModule } from '../app.module';

/**
 * Real Firestore-emulator-backed e2e coverage for KAN-53's inbound hook endpoint — same posture
 * as `IngestController`'s own e2e suite: a real app, real HTTP, a real emulator, rather than
 * mocking `@growthos/firebase-orm-models`.
 */

let app: INestApplication;
let baseUrl: string;
// Minting an `hmac_sha256` endpoint from this test needs a `KmsProvider` — built from the *same*
// `GROWTHOS_VAULT_KEYS` the controller's own `getServerKmsProvider()` reads at request time, so
// the secret this test encrypts is the one the running app can actually decrypt.
let kms: KmsProvider;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8100';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  process.env.GROWTHOS_VAULT_KEYS = JSON.stringify({ currentKeyId: 'v1', keys: { v1: randomBytes(32).toString('base64') } });
  const { keyRing, currentKeyId } = loadLocalKmsKeyRingFromEnv();
  kms = new LocalKmsProvider(keyRing, currentKeyId);
  await connectFirestoreOrm({ projectId: 'demo-growthos-test', emulatorHost: '127.0.0.1:8100' });

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
  it('accepts (202) a payload sent to a none-mode endpoint and queues it for review, no signature required', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('None Mode Org');
    const { hookEndpoint } = await mintHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Shopify orders',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });

    const res = await fetch(`${baseUrl}/v1/hooks/${project.id}/${hookEndpoint.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: 'ord_1' }),
    });
    expect(res.status).toBe(202);

    const queue = await listHookPayloadsForProject(organization.id, project.id);
    expect(queue).toHaveLength(1);
    expect(queue[0].signature_status).toBe('not_configured');
    expect(queue[0].status).toBe('pending_review');
    expect(JSON.parse(queue[0].raw_body)).toEqual({ order_id: 'ord_1' });
  });

  it('verifies a correctly signed payload against an hmac_sha256 endpoint', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Hmac Mode Org');
    const { hookEndpoint, rawSigningSecret } = await mintHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Custom CRM',
      signatureMode: 'hmac_sha256',
      createdByUserId: owner.id,
      kms,
    });
    const rawBody = JSON.stringify({ order_id: 'ord_2' });

    const res = await fetch(`${baseUrl}/v1/hooks/${project.id}/${hookEndpoint.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-GrowthOS-Signature': computeHookSignature(rawBody, rawSigningSecret!) },
      body: rawBody,
    });
    expect(res.status).toBe(202);

    const queue = await listHookPayloadsForProject(organization.id, project.id);
    expect(queue[0].signature_status).toBe('verified');
  });

  it('accepts (202) but marks invalid a payload signed with the wrong secret — nothing is dropped', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Wrong Secret Org');
    const { hookEndpoint } = await mintHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Custom CRM',
      signatureMode: 'hmac_sha256',
      createdByUserId: owner.id,
      kms,
    });
    const rawBody = JSON.stringify({ order_id: 'ord_3' });

    const res = await fetch(`${baseUrl}/v1/hooks/${project.id}/${hookEndpoint.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-GrowthOS-Signature': computeHookSignature(rawBody, 'wrong-secret') },
      body: rawBody,
    });
    expect(res.status).toBe(202);

    const queue = await listHookPayloadsForProject(organization.id, project.id);
    expect(queue[0].signature_status).toBe('invalid');
    expect(queue[0].status).toBe('pending_review');
  });

  it('rejects (404) a hook id that does not exist', async () => {
    const { project } = await setupProject('No Endpoint Org');
    const res = await fetch(`${baseUrl}/v1/hooks/${project.id}/does-not-exist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it('rejects (404) a hook id presented against the wrong project', async () => {
    const owner = await setupProject('Owner Project Org');
    const other = await setupProject('Other Project Org');
    const { hookEndpoint } = await mintHookEndpoint({
      organizationId: owner.organization.id,
      projectId: owner.project.id,
      environmentId: owner.prodEnvironment.id,
      name: 'Owner hook',
      signatureMode: 'none',
      createdByUserId: owner.owner.id,
    });

    const res = await fetch(`${baseUrl}/v1/hooks/${other.project.id}/${hookEndpoint.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it('rejects (404) a payload sent to a revoked hook endpoint', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Revoked Org');
    const { hookEndpoint } = await mintHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Soon revoked',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });
    await revokeHookEndpoint({ organizationId: organization.id, projectId: project.id, hookEndpointId: hookEndpoint.id, revokedByUserId: owner.id });

    const res = await fetch(`${baseUrl}/v1/hooks/${project.id}/${hookEndpoint.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });
});
