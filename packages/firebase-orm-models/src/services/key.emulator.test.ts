import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ApiKeyNotFoundError,
  createOrganizationWithOwner,
  createProject,
  EnvironmentNotFoundError,
  ensureUserForFirebaseSession,
  InvalidApiKeyScopeError,
  listApiKeysForProject,
  mintApiKey,
  ProjectNotFoundError,
  revokeApiKey,
  verifyApiKeyForRequest,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-28's key service: mint, auth, and immediate revoke. */

beforeAll(async () => {
  await connectToFirestoreEmulator('key-service-tests');
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
  const devEnvironment = environments.find((e) => e.name === 'dev')!;
  return { owner, organization, project, prodEnvironment, devEnvironment };
}

describe('mintApiKey', () => {
  it('mints a gos_live_ key for a prod environment, hashing the secret rather than storing it', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Live Key Org');

    const { apiKey, rawKey } = await mintApiKey({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Production ingest key',
      scopes: ['ingest.write'],
      createdByUserId: owner.id,
    });

    expect(rawKey).toMatch(/^gos_live_/);
    expect(apiKey.key_prefix).toBe(rawKey.slice(0, apiKey.key_prefix.length));
    expect(apiKey.key_prefix.length).toBeLessThan(rawKey.length);
    expect(apiKey.hashed_secret).not.toBe(rawKey);
    expect(apiKey.hashed_secret).toMatch(/^[0-9a-f]{64}$/);
    expect(apiKey.environment_id).toBe(prodEnvironment.id);
  });

  it('mints a gos_test_ key for dev/staging environments', async () => {
    const { owner, organization, project, devEnvironment } = await setupProject('Test Key Org');

    const { rawKey } = await mintApiKey({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: devEnvironment.id,
      name: 'Dev ingest key',
      scopes: ['ingest.write'],
      createdByUserId: owner.id,
    });

    expect(rawKey).toMatch(/^gos_test_/);
  });

  it('rejects an unknown project', async () => {
    const { owner, organization, prodEnvironment } = await setupProject('No Project Org');

    await expect(
      mintApiKey({
        organizationId: organization.id,
        projectId: 'does-not-exist',
        environmentId: prodEnvironment.id,
        name: 'x',
        scopes: ['ingest.write'],
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it('rejects an environment that does not belong to the project', async () => {
    const first = await setupProject('Env Owner Org');
    const second = await setupProject('Env Borrower Org');

    await expect(
      mintApiKey({
        organizationId: second.organization.id,
        projectId: second.project.id,
        environmentId: first.prodEnvironment.id,
        name: 'x',
        scopes: ['ingest.write'],
        createdByUserId: second.owner.id,
      }),
    ).rejects.toBeInstanceOf(EnvironmentNotFoundError);
  });

  it('rejects an empty or out-of-catalog scope list', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Bad Scope Org');

    await expect(
      mintApiKey({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: prodEnvironment.id,
        name: 'x',
        scopes: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidApiKeyScopeError);

    await expect(
      mintApiKey({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: prodEnvironment.id,
        name: 'x',
        // `billing.manage` is a real Permission but not a valid API_KEY_SCOPE.
        scopes: ['billing.manage' as never],
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidApiKeyScopeError);
  });
});

describe('verifyApiKeyForRequest', () => {
  it('authenticates a valid key for its own project/environment/scope and tracks last_used_at', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Auth Org');
    const { apiKey, rawKey } = await mintApiKey({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Prod key',
      scopes: ['ingest.write', 'metrics.write'],
      createdByUserId: owner.id,
    });
    expect(apiKey.last_used_at).toBeUndefined();

    const result = await verifyApiKeyForRequest({
      rawKey,
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      requiredScope: 'ingest.write',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.apiKey.id).toBe(apiKey.id);
      expect(result.value.scopes).toEqual(['ingest.write', 'metrics.write']);
      expect(result.value.apiKey.last_used_at).toBeTruthy();
    }

    // A multi-scope key must authenticate against *every* scope it carries, not just the first.
    const secondScopeResult = await verifyApiKeyForRequest({
      rawKey,
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      requiredScope: 'metrics.write',
    });
    expect(secondScopeResult.ok).toBe(true);
  });

  it('rejects an unknown/garbage key', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Unknown Key Org');

    const result = await verifyApiKeyForRequest({
      rawKey: 'gos_live_not-a-real-key',
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      requiredScope: 'ingest.write',
    });

    expect(result.ok).toBe(false);
  });

  it('rejects a key presented against the wrong project', async () => {
    const owner = await setupProject('Wrong Project Owner Org');
    const other = await setupProject('Wrong Project Other Org');
    const { rawKey } = await mintApiKey({
      organizationId: owner.organization.id,
      projectId: owner.project.id,
      environmentId: owner.prodEnvironment.id,
      name: 'Owner key',
      scopes: ['ingest.write'],
      createdByUserId: owner.owner.id,
    });

    const result = await verifyApiKeyForRequest({
      rawKey,
      organizationId: other.organization.id,
      projectId: other.project.id,
      environmentId: other.prodEnvironment.id,
      requiredScope: 'ingest.write',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/project/i);
    }
  });

  it('rejects a key presented against the wrong environment', async () => {
    const { owner, organization, project, prodEnvironment, devEnvironment } = await setupProject('Wrong Env Org');
    const { rawKey } = await mintApiKey({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Prod-only key',
      scopes: ['ingest.write'],
      createdByUserId: owner.id,
    });

    const result = await verifyApiKeyForRequest({
      rawKey,
      organizationId: organization.id,
      projectId: project.id,
      environmentId: devEnvironment.id,
      requiredScope: 'ingest.write',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/environment/i);
    }
  });

  it('rejects a key that lacks the required scope', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Missing Scope Org');
    const { rawKey } = await mintApiKey({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Ingest-only key',
      scopes: ['ingest.write'],
      createdByUserId: owner.id,
    });

    const result = await verifyApiKeyForRequest({
      rawKey,
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      requiredScope: 'metrics.write',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/scope/i);
    }
  });
});

describe('revokeApiKey', () => {
  it('is immediate: a revoked key fails auth on the very next verify call', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Revoke Org');
    const { apiKey, rawKey } = await mintApiKey({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Soon-to-be-revoked key',
      scopes: ['ingest.write'],
      createdByUserId: owner.id,
    });

    const before = await verifyApiKeyForRequest({
      rawKey,
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      requiredScope: 'ingest.write',
    });
    expect(before.ok).toBe(true);

    const revoked = await revokeApiKey({
      organizationId: organization.id,
      projectId: project.id,
      apiKeyId: apiKey.id,
      revokedByUserId: owner.id,
    });
    expect(revoked.revoked_at).toBeTruthy();

    const after = await verifyApiKeyForRequest({
      rawKey,
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      requiredScope: 'ingest.write',
    });
    expect(after.ok).toBe(false);
    if (!after.ok) {
      expect(after.error).toMatch(/revoked/i);
    }
  });

  it('does not affect a sibling key in the same project when one is revoked', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Sibling Key Org');
    const keyA = await mintApiKey({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Key A',
      scopes: ['ingest.write'],
      createdByUserId: owner.id,
    });
    const keyB = await mintApiKey({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Key B',
      scopes: ['ingest.write'],
      createdByUserId: owner.id,
    });

    await revokeApiKey({
      organizationId: organization.id,
      projectId: project.id,
      apiKeyId: keyA.apiKey.id,
      revokedByUserId: owner.id,
    });

    const keyAResult = await verifyApiKeyForRequest({
      rawKey: keyA.rawKey,
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      requiredScope: 'ingest.write',
    });
    expect(keyAResult.ok).toBe(false);

    const keyBResult = await verifyApiKeyForRequest({
      rawKey: keyB.rawKey,
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      requiredScope: 'ingest.write',
    });
    expect(keyBResult.ok).toBe(true);
    if (keyBResult.ok) {
      expect(keyBResult.value.apiKey.id).toBe(keyB.apiKey.id);
    }
  });

  it('rejects revoking a key that does not exist in this project', async () => {
    const { owner, organization, project } = await setupProject('Revoke Missing Org');

    await expect(
      revokeApiKey({
        organizationId: organization.id,
        projectId: project.id,
        apiKeyId: 'does-not-exist',
        revokedByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(ApiKeyNotFoundError);
  });
});

describe('listApiKeysForProject', () => {
  it('lists every key for a project without ever exposing hashed_secret', async () => {
    const { owner, organization, project, prodEnvironment, devEnvironment } = await setupProject('List Org');
    const { apiKey: liveKey } = await mintApiKey({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Live key',
      scopes: ['ingest.write'],
      createdByUserId: owner.id,
    });
    await mintApiKey({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: devEnvironment.id,
      name: 'Test key',
      scopes: ['metrics.write'],
      createdByUserId: owner.id,
    });

    const summaries = await listApiKeysForProject(organization.id, project.id);

    expect(summaries).toHaveLength(2);
    expect(summaries.map((s) => s.name).sort()).toEqual(['Live key', 'Test key']);
    for (const summary of summaries) {
      expect(summary).not.toHaveProperty('hashed_secret');
      expect(summary).not.toHaveProperty('hashedSecret');
    }
    const live = summaries.find((s) => s.id === liveKey.id)!;
    expect(live.keyPrefix).toMatch(/^gos_live_/);
    expect(live.revokedAt).toBeUndefined();
  });
});
