import { randomBytes } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createHookEndpoint, createOrganizationWithOwner, createProject, ensureUserForFirebaseSession } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { PUT } from './route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  process.env.GROWTHOS_VAULT_KEYS = JSON.stringify({ currentKeyId: 'v1', keys: { v1: randomBytes(32).toString('base64') } });
  await ensureFirestoreOrm();
});

beforeEach(() => {
  getServerSessionMock.mockReset();
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function sessionFor(firebaseUid: string, email: string): Promise<DecodedIdToken> {
  await ensureUserForFirebaseSession({ firebaseUid, email });
  return { uid: firebaseUid, email } as DecodedIdToken;
}

async function setupEndpoint(orgName: string, signatureMode: 'none' | 'hmac_sha256' = 'hmac_sha256') {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const prodEnvironment = environments.find((e) => e.name === 'prod')!;
  const endpoint = await createHookEndpoint({
    organizationId: organization.id,
    projectId: project.id,
    environmentId: prodEnvironment.id,
    name: 'x',
    signatureMode,
    signatureHeaderName: signatureMode === 'hmac_sha256' ? 'X-Signature' : undefined,
    createdByUserId: owner.id,
  });
  return { ownerSession, organization, project, endpoint };
}

function secretRequest(
  orgId: string,
  projectId: string,
  hookEndpointId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; hookEndpointId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/hook-endpoints/${hookEndpointId}/secret`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? { signingSecret: 'shh' }),
    }),
    params: Promise.resolve({ orgId, projectId, hookEndpointId }),
  };
}

describe('PUT /api/orgs/[orgId]/projects/[projectId]/hook-endpoints/[hookEndpointId]/secret', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = secretRequest('org-1', 'project-1', 'endpoint-1');
    const response = await PUT(request, { params });
    expect(response.status).toBe(401);
  });

  it('rejects a missing/blank secret', async () => {
    const { ownerSession, organization, project, endpoint } = await setupEndpoint('Hooks Secret Validation Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const missing = secretRequest(organization.id, project.id, endpoint.id, {});
    expect((await PUT(missing.request, { params: missing.params })).status).toBe(400);

    const blank = secretRequest(organization.id, project.id, endpoint.id, { signingSecret: '   ' });
    expect((await PUT(blank.request, { params: blank.params })).status).toBe(400);
  });

  it('rejects setting a secret on a "none"-mode endpoint', async () => {
    const { ownerSession, organization, project, endpoint } = await setupEndpoint('Hooks Secret Wrong Mode Org', 'none');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = secretRequest(organization.id, project.id, endpoint.id);
    const response = await PUT(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'not_hmac_mode' });
  });

  it('returns 404 for an endpoint that does not exist in this project', async () => {
    const { ownerSession, organization, project } = await setupEndpoint('Hooks Secret Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = secretRequest(organization.id, project.id, 'does-not-exist');
    const response = await PUT(request, { params });
    expect(response.status).toBe(404);
  });

  it('lets an org_owner set a secret, and reports 500 when the vault is not configured', async () => {
    const { ownerSession, organization, project, endpoint } = await setupEndpoint('Hooks Secret Happy Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = secretRequest(organization.id, project.id, endpoint.id);
    const response = await PUT(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'set' });

    const previousVaultKeys = process.env.GROWTHOS_VAULT_KEYS;
    delete process.env.GROWTHOS_VAULT_KEYS;
    try {
      const unconfigured = secretRequest(organization.id, project.id, endpoint.id);
      const unconfiguredResponse = await PUT(unconfigured.request, { params: unconfigured.params });
      expect(unconfiguredResponse.status).toBe(500);
    } finally {
      process.env.GROWTHOS_VAULT_KEYS = previousVaultKeys;
    }
  });
});
