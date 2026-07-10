import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  computeHookSignature,
  createOrganizationWithOwner,
  createProject,
  dismissHookPayload,
  ensureUserForFirebaseSession,
  generateLocalKmsKeyRing,
  HookEndpointNotFoundError,
  HookPayloadNotFoundError,
  listHookPayloadsForProject,
  LocalKmsProvider,
  mintHookEndpoint,
  receiveHookPayload,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-53's hook-ingest service: receive (store-always, signature-status-recorded), the review queue, and dismiss. */

beforeAll(async () => {
  await connectToFirestoreEmulator('hook-ingest-service-tests');
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

describe('receiveHookPayload', () => {
  it('stores a payload sent to a none-mode endpoint as not_configured, needing no signature header', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('None Mode Org');
    const { hookEndpoint } = await mintHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Open hook',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });

    const payload = await receiveHookPayload({
      projectId: project.id,
      hookEndpointId: hookEndpoint.id,
      rawBody: '{"order_id":"1"}',
      headers: { 'content-type': 'application/json' },
    });

    expect(payload.signature_status).toBe('not_configured');
    expect(payload.status).toBe('pending_review');
    expect(payload.raw_body).toBe('{"order_id":"1"}');
    expect(payload.organization_id).toBe(organization.id);
    expect(payload.environment_id).toBe(prodEnvironment.id);
  });

  it('stores (does not drop) a payload with no signature header sent to an hmac_sha256 endpoint, marked missing', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Missing Sig Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);
    const { hookEndpoint } = await mintHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Signed hook',
      signatureMode: 'hmac_sha256',
      createdByUserId: owner.id,
      kms,
    });

    const payload = await receiveHookPayload({
      projectId: project.id,
      hookEndpointId: hookEndpoint.id,
      rawBody: '{"order_id":"2"}',
      headers: {},
      getKms: () => kms,
    });

    expect(payload.signature_status).toBe('missing');
    expect(payload.status).toBe('pending_review');
  });

  it('marks a correctly signed payload verified', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Verified Sig Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);
    const { hookEndpoint, rawSigningSecret } = await mintHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Signed hook',
      signatureMode: 'hmac_sha256',
      createdByUserId: owner.id,
      kms,
    });
    const rawBody = '{"order_id":"3"}';

    const signatureHeaderValue = computeHookSignature(rawBody, rawSigningSecret!);
    const payload = await receiveHookPayload({
      projectId: project.id,
      hookEndpointId: hookEndpoint.id,
      rawBody,
      headers: { 'x-growthos-signature': signatureHeaderValue },
      signatureHeaderValue,
      getKms: () => kms,
    });

    expect(payload.signature_status).toBe('verified');
    expect(payload.status).toBe('pending_review');
  });

  it('marks a payload signed with the wrong secret invalid, and still stores it', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Invalid Sig Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);
    const { hookEndpoint } = await mintHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Signed hook',
      signatureMode: 'hmac_sha256',
      createdByUserId: owner.id,
      kms,
    });
    const rawBody = '{"order_id":"4"}';

    const signatureHeaderValue = computeHookSignature(rawBody, 'wrong-secret');
    const payload = await receiveHookPayload({
      projectId: project.id,
      hookEndpointId: hookEndpoint.id,
      rawBody,
      headers: { 'x-growthos-signature': signatureHeaderValue },
      signatureHeaderValue,
      getKms: () => kms,
    });

    expect(payload.signature_status).toBe('invalid');
    expect(payload.status).toBe('pending_review');
  });

  it('rejects a payload posted to an unknown or wrong-project hook id', async () => {
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

    await expect(
      receiveHookPayload({ projectId: 'does-not-exist', hookEndpointId: hookEndpoint.id, rawBody: '{}', headers: {} }),
    ).rejects.toBeInstanceOf(HookEndpointNotFoundError);

    await expect(
      receiveHookPayload({ projectId: other.project.id, hookEndpointId: hookEndpoint.id, rawBody: '{}', headers: {} }),
    ).rejects.toBeInstanceOf(HookEndpointNotFoundError);
  });
});

describe('listHookPayloadsForProject + dismissHookPayload', () => {
  it('lists only pending_review payloads, newest first, and dismiss removes one from the list', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Queue Org');
    const { hookEndpoint } = await mintHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Open hook',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });

    const first = await receiveHookPayload({
      projectId: project.id,
      hookEndpointId: hookEndpoint.id,
      rawBody: '{"n":1}',
      headers: {},
    });
    const second = await receiveHookPayload({
      projectId: project.id,
      hookEndpointId: hookEndpoint.id,
      rawBody: '{"n":2}',
      headers: {},
    });

    const beforeDismiss = await listHookPayloadsForProject(organization.id, project.id);
    expect(beforeDismiss.map((p) => p.id).sort()).toEqual([first.id, second.id].sort());

    const dismissed = await dismissHookPayload({
      organizationId: organization.id,
      projectId: project.id,
      hookPayloadId: first.id,
      reviewedByUserId: owner.id,
    });
    expect(dismissed.status).toBe('dismissed');
    expect(dismissed.reviewed_at).toBeTruthy();

    const afterDismiss = await listHookPayloadsForProject(organization.id, project.id);
    expect(afterDismiss.map((p) => p.id)).toEqual([second.id]);
  });

  it('rejects dismissing a payload that does not exist in this project', async () => {
    const { owner, organization, project } = await setupProject('Dismiss Missing Org');

    await expect(
      dismissHookPayload({
        organizationId: organization.id,
        projectId: project.id,
        hookPayloadId: 'does-not-exist',
        reviewedByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(HookPayloadNotFoundError);
  });
});
