import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, mintHookEndpoint } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { DELETE } from './route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
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

function revokeRequest(
  orgId: string,
  projectId: string,
  hookEndpointId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; hookEndpointId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/hooks/${hookEndpointId}`, {
      method: 'DELETE',
    }),
    params: Promise.resolve({ orgId, projectId, hookEndpointId }),
  };
}

describe('DELETE /api/orgs/[orgId]/projects/[projectId]/hooks/[hookEndpointId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = revokeRequest('org-1', 'project-1', 'hook-1');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for an unknown hook endpoint in a real project', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('revoke-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Revoke Missing Hook Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = revokeRequest(organization.id, project.id, 'does-not-exist-hook');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(404);
  });

  it('revokes an existing hook endpoint immediately', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('revoke-happy-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Revoke Happy Hook Org', ownerUserId: owner.id });
    const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
    const prodEnvironment = environments.find((e) => e.name === 'prod')!;

    const { hookEndpoint } = await mintHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Doomed hook',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = revokeRequest(organization.id, project.id, hookEndpoint.id);
    const response = await DELETE(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'revoked' });
  });
});
