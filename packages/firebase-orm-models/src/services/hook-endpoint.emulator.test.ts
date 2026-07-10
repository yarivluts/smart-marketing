import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  EnvironmentNotFoundError,
  findLiveHookEndpointForProject,
  generateLocalKmsKeyRing,
  HmacSigningSecretRequiresKmsError,
  HookEndpointNotFoundError,
  LocalKmsProvider,
  listHookEndpointsForProject,
  mintHookEndpoint,
  ProjectNotFoundError,
  revokeHookEndpoint,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-53's hook-endpoint service: mint (none/hmac_sha256), list, immediate revoke, and the bearer-key-free lookup `hook-ingest.service.ts` needs. */

beforeAll(async () => {
  await connectToFirestoreEmulator('hook-endpoint-service-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

function testKms() {
  const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
  return new LocalKmsProvider(keyRing, currentKeyId);
}

async function setupProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const prodEnvironment = environments.find((e) => e.name === 'prod')!;
  return { owner, organization, project, prodEnvironment };
}

describe('mintHookEndpoint', () => {
  it('mints a none-mode endpoint with no signing secret and no KMS required', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('None Mode Org');

    const { hookEndpoint, rawSigningSecret } = await mintHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Shopify orders',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });

    expect(hookEndpoint.signature_mode).toBe('none');
    expect(hookEndpoint.encrypted_signing_secret).toBeUndefined();
    expect(rawSigningSecret).toBeUndefined();
  });

  it('mints an hmac_sha256 endpoint with a raw secret returned once, never stored in the clear', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Hmac Mode Org');

    const { hookEndpoint, rawSigningSecret } = await mintHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Custom CRM',
      signatureMode: 'hmac_sha256',
      createdByUserId: owner.id,
      kms: testKms(),
    });

    expect(rawSigningSecret).toBeTruthy();
    expect(hookEndpoint.encrypted_signing_secret).toBeTruthy();
    expect(JSON.stringify(hookEndpoint.encrypted_signing_secret)).not.toContain(rawSigningSecret!);
  });

  it('rejects an hmac_sha256 endpoint minted without a KMS provider', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('No Kms Org');

    await expect(
      mintHookEndpoint({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: prodEnvironment.id,
        name: 'x',
        signatureMode: 'hmac_sha256',
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(HmacSigningSecretRequiresKmsError);
  });

  it('rejects an unknown project', async () => {
    const { owner, organization, prodEnvironment } = await setupProject('No Project Org');

    await expect(
      mintHookEndpoint({
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
    const first = await setupProject('Env Owner Org');
    const second = await setupProject('Env Borrower Org');

    await expect(
      mintHookEndpoint({
        organizationId: second.organization.id,
        projectId: second.project.id,
        environmentId: first.prodEnvironment.id,
        name: 'x',
        signatureMode: 'none',
        createdByUserId: second.owner.id,
      }),
    ).rejects.toBeInstanceOf(EnvironmentNotFoundError);
  });
});

describe('listHookEndpointsForProject', () => {
  it('lists every endpoint for a project without ever exposing encrypted_signing_secret', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('List Org');
    await mintHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Open hook',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });
    await mintHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Signed hook',
      signatureMode: 'hmac_sha256',
      createdByUserId: owner.id,
      kms: testKms(),
    });

    const summaries = await listHookEndpointsForProject(organization.id, project.id);

    expect(summaries).toHaveLength(2);
    expect(summaries.map((s) => s.name).sort()).toEqual(['Open hook', 'Signed hook']);
    for (const summary of summaries) {
      expect(summary).not.toHaveProperty('encrypted_signing_secret');
      expect(summary).not.toHaveProperty('encryptedSigningSecret');
    }
  });
});

describe('revokeHookEndpoint', () => {
  it('is immediate: a revoked endpoint no longer resolves via findLiveHookEndpointForProject', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Revoke Org');
    const { hookEndpoint } = await mintHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Soon revoked',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });

    const before = await findLiveHookEndpointForProject(project.id, hookEndpoint.id);
    expect(before?.id).toBe(hookEndpoint.id);

    const revoked = await revokeHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      hookEndpointId: hookEndpoint.id,
      revokedByUserId: owner.id,
    });
    expect(revoked.revoked_at).toBeTruthy();

    const after = await findLiveHookEndpointForProject(project.id, hookEndpoint.id);
    expect(after).toBeUndefined();
  });

  it('rejects revoking an endpoint that does not exist in this project', async () => {
    const { owner, organization, project } = await setupProject('Revoke Missing Org');

    await expect(
      revokeHookEndpoint({
        organizationId: organization.id,
        projectId: project.id,
        hookEndpointId: 'does-not-exist',
        revokedByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(HookEndpointNotFoundError);
  });
});

describe('findLiveHookEndpointForProject', () => {
  it('does not resolve an endpoint minted for a different project', async () => {
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

    const result = await findLiveHookEndpointForProject(other.project.id, hookEndpoint.id);
    expect(result).toBeUndefined();
  });
});
