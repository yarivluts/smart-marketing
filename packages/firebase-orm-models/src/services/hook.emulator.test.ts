import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  createHookEndpoint,
  createOrganizationWithOwner,
  createProject,
  disableHookEndpoint,
  EnvironmentNotFoundError,
  ensureUserForFirebaseSession,
  generateLocalKmsKeyRing,
  HookEndpointNotFoundError,
  HookEndpointNotHmacModeError,
  LocalKmsProvider,
  listHookDeliveriesForProject,
  listHookEndpointsForProject,
  MissingSignatureHeaderNameError,
  ProjectNotFoundError,
  receiveHookPayload,
  setHookDeliveryStatus,
  setHookEndpointSigningSecret,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-53's inbound hook receiver: endpoint create/disable, HMAC signature verification, and the review queue. */

beforeAll(async () => {
  await connectToFirestoreEmulator('hook-service-tests');
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

function kms() {
  const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
  return new LocalKmsProvider(keyRing, currentKeyId);
}

describe('createHookEndpoint', () => {
  it('creates a "none"-mode endpoint with a random, unguessable hook_id', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Hook None Org');

    const endpoint = await createHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Zero-config webhook',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });

    expect(endpoint.hook_id).toBeTruthy();
    expect(endpoint.hook_id.length).toBeGreaterThan(20);
    expect(endpoint.signature_mode).toBe('none');
    expect(endpoint.disabled_at).toBeUndefined();
  });

  it('rejects an unknown project', async () => {
    const { owner, organization, prodEnvironment } = await setupProject('Hook No Project Org');

    await expect(
      createHookEndpoint({
        organizationId: organization.id,
        projectId: 'does-not-exist',
        environmentId: prodEnvironment.id,
        name: 'x',
        signatureMode: 'none',
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it('rejects an environment that does not belong to the project', async () => {
    const first = await setupProject('Hook Env Owner Org');
    const second = await setupProject('Hook Env Borrower Org');

    await expect(
      createHookEndpoint({
        organizationId: second.organization.id,
        projectId: second.project.id,
        environmentId: first.prodEnvironment.id,
        name: 'x',
        signatureMode: 'none',
        createdByUserId: second.owner.id,
      }),
    ).rejects.toBeInstanceOf(EnvironmentNotFoundError);
  });

  it('requires a signature_header_name when signatureMode is hmac_sha256', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Hook Missing Header Org');

    await expect(
      createHookEndpoint({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: prodEnvironment.id,
        name: 'x',
        signatureMode: 'hmac_sha256',
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(MissingSignatureHeaderNameError);
  });
});

describe('setHookEndpointSigningSecret', () => {
  it('rejects setting a secret on a "none"-mode endpoint', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Hook Wrong Mode Org');
    const endpoint = await createHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'x',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });

    await expect(
      setHookEndpointSigningSecret({
        organizationId: organization.id,
        projectId: project.id,
        hookEndpointId: endpoint.id,
        signingSecret: 'shh',
        kms: kms(),
        actedByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(HookEndpointNotHmacModeError);
  });
});

describe('disableHookEndpoint', () => {
  it('is immediate and idempotent', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Hook Disable Org');
    const endpoint = await createHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'x',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });

    const disabled = await disableHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      hookEndpointId: endpoint.id,
      disabledByUserId: owner.id,
    });
    expect(disabled.disabled_at).toBeTruthy();

    // Re-disabling an already-disabled endpoint is safe, not an error.
    const disabledAgain = await disableHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      hookEndpointId: endpoint.id,
      disabledByUserId: owner.id,
    });
    expect(disabledAgain.disabled_at).toBeTruthy();
  });

  it('rejects disabling an endpoint that does not exist in this project', async () => {
    const { owner, organization, project } = await setupProject('Hook Disable Missing Org');

    await expect(
      disableHookEndpoint({
        organizationId: organization.id,
        projectId: project.id,
        hookEndpointId: 'does-not-exist',
        disabledByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(HookEndpointNotFoundError);
  });
});

describe('receiveHookPayload', () => {
  it('stores a delivery for a "none"-mode endpoint with no signature check', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Hook Receive None Org');
    const endpoint = await createHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'x',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });

    const result = await receiveHookPayload({
      hookId: endpoint.hook_id,
      rawBody: JSON.stringify({ hello: 'world' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.delivery.status).toBe('pending');
      expect(result.value.delivery.signature_verified).toBe(false);
      expect(result.value.delivery.raw_payload).toBe(JSON.stringify({ hello: 'world' }));
      expect(result.value.delivery.headers).toEqual({ 'content-type': 'application/json' });
      // Only the allowlisted headers survive — nothing else is captured.
      expect(result.value.delivery.headers).not.toHaveProperty('cookie');
    }
  });

  it('returns not_found for an unknown hook_id and persists nothing', async () => {
    const { organization, project } = await setupProject('Hook Receive Unknown Org');

    const result = await receiveHookPayload({ hookId: 'not-a-real-hook-id', rawBody: '{}', headers: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('not_found');
    }

    const deliveries = await listHookDeliveriesForProject(organization.id, project.id);
    expect(deliveries).toHaveLength(0);
  });

  it('returns not_found once the endpoint is disabled, indistinguishable from an unknown hook_id', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Hook Receive Disabled Org');
    const endpoint = await createHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'x',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });
    await disableHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      hookEndpointId: endpoint.id,
      disabledByUserId: owner.id,
    });

    const result = await receiveHookPayload({ hookId: endpoint.hook_id, rawBody: '{}', headers: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('not_found');
    }
  });

  it('verifies an hmac_sha256 endpoint\'s signature and rejects a bad one without persisting anything', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Hook Receive Hmac Org');
    const endpoint = await createHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Signed webhook',
      signatureMode: 'hmac_sha256',
      signatureHeaderName: 'X-Hub-Signature-256',
      createdByUserId: owner.id,
    });
    const secretKms = kms();
    await setHookEndpointSigningSecret({
      organizationId: organization.id,
      projectId: project.id,
      hookEndpointId: endpoint.id,
      signingSecret: 'top-secret',
      kms: secretKms,
      actedByUserId: owner.id,
    });

    const rawBody = JSON.stringify({ ping: true });
    const goodSignature = `sha256=${createHmac('sha256', 'top-secret').update(rawBody).digest('hex')}`;

    const rejected = await receiveHookPayload({
      hookId: endpoint.hook_id,
      rawBody,
      headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
      kms: secretKms,
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.error).toBe('invalid_signature');
    }

    const missingHeader = await receiveHookPayload({ hookId: endpoint.hook_id, rawBody, headers: {}, kms: secretKms });
    expect(missingHeader.ok).toBe(false);

    const accepted = await receiveHookPayload({
      hookId: endpoint.hook_id,
      rawBody,
      headers: { 'x-hub-signature-256': goodSignature },
      kms: secretKms,
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.value.delivery.signature_verified).toBe(true);
    }

    const deliveries = await listHookDeliveriesForProject(organization.id, project.id);
    expect(deliveries).toHaveLength(1);
  });

  it('rejects every hmac_sha256 delivery until a secret has been set', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Hook Receive No Secret Org');
    const endpoint = await createHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Unset secret',
      signatureMode: 'hmac_sha256',
      signatureHeaderName: 'X-Signature',
      createdByUserId: owner.id,
    });

    const result = await receiveHookPayload({
      hookId: endpoint.hook_id,
      rawBody: '{}',
      headers: { 'x-signature': 'sha256=anything' },
      kms: kms(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid_signature');
    }
  });
});

describe('listHookDeliveriesForProject / setHookDeliveryStatus', () => {
  it('lists deliveries newest-first and lets a human mark them reviewed or discarded', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Hook Queue Org');
    const endpoint = await createHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'x',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });

    const first = await receiveHookPayload({ hookId: endpoint.hook_id, rawBody: '{"n":1}', headers: {} });
    const second = await receiveHookPayload({ hookId: endpoint.hook_id, rawBody: '{"n":2}', headers: {} });
    if (!first.ok || !second.ok) throw new Error('expected both deliveries to be accepted');

    const listed = await listHookDeliveriesForProject(organization.id, project.id);
    expect(listed).toHaveLength(2);
    expect(listed.every((d) => d.status === 'pending')).toBe(true);

    const reviewed = await setHookDeliveryStatus({
      organizationId: organization.id,
      projectId: project.id,
      hookDeliveryId: first.value.delivery.id,
      status: 'reviewed',
      actedByUserId: owner.id,
    });
    expect(reviewed.status).toBe('reviewed');
    expect(reviewed.reviewed_at).toBeTruthy();

    const discarded = await setHookDeliveryStatus({
      organizationId: organization.id,
      projectId: project.id,
      hookDeliveryId: second.value.delivery.id,
      status: 'discarded',
      actedByUserId: owner.id,
    });
    expect(discarded.status).toBe('discarded');
  });
});

describe('listHookEndpointsForProject', () => {
  it('lists every endpoint (active or disabled) for a project', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Hook List Org');
    await createHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'A',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });
    const b = await createHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'B',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });
    await disableHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      hookEndpointId: b.id,
      disabledByUserId: owner.id,
    });

    const endpoints = await listHookEndpointsForProject(organization.id, project.id);
    expect(endpoints.map((e) => e.name).sort()).toEqual(['A', 'B']);
    expect(endpoints.find((e) => e.id === b.id)?.disabled_at).toBeTruthy();
  });
});
