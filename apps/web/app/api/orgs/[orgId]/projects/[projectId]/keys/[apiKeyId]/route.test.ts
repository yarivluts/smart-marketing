import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  mintApiKey,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { DELETE, PATCH } from './route';

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
  apiKeyId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; apiKeyId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/keys/${apiKeyId}`, {
      method: 'DELETE',
    }),
    params: Promise.resolve({ orgId, projectId, apiKeyId }),
  };
}

describe('DELETE /api/orgs/[orgId]/projects/[projectId]/keys/[apiKeyId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = revokeRequest('org-1', 'project-1', 'key-1');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for an unknown key in a real project', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('revoke-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Revoke Missing Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = revokeRequest(organization.id, project.id, 'does-not-exist-key');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(404);
  });

  it('revokes an existing key immediately', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('revoke-happy-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Revoke Happy Org', ownerUserId: owner.id });
    const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
    const prodEnvironment = environments.find((e) => e.name === 'prod')!;

    const { apiKey } = await mintApiKey({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Doomed key',
      scopes: ['ingest.write'],
      createdByUserId: owner.id,
    });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = revokeRequest(organization.id, project.id, apiKey.id);
    const response = await DELETE(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'revoked' });
  });
});

function patchRequest(orgId: string, projectId: string, apiKeyId: string, body: unknown): NextRequest {
  return new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/keys/${apiKeyId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/orgs/[orgId]/projects/[projectId]/keys/[apiKeyId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await PATCH(patchRequest('org-1', 'project-1', 'key-1', { name: 'x' }), {
      params: Promise.resolve({ orgId: 'org-1', projectId: 'project-1', apiKeyId: 'key-1' }),
    });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold keys.manage (viewer)", async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('rename-route-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Rename Route Viewer Org', ownerUserId: owner.id });
    const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
    const prodEnvironment = environments.find((e) => e.name === 'prod')!;
    const { apiKey } = await mintApiKey({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Original name',
      scopes: ['ingest.write'],
      createdByUserId: owner.id,
    });

    const viewerEmail = uniqueEmail('rename-route-viewer');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: viewerEmail,
      role: 'viewer',
      invitedByUserId: owner.id,
    });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const response = await PATCH(patchRequest(organization.id, project.id, apiKey.id, { name: 'Should not stick' }), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, apiKeyId: apiKey.id }),
    });
    expect(response.status).toBe(403);
  });

  it('returns 404 for an unknown key in a real project', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('rename-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Rename Missing Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const response = await PATCH(patchRequest(organization.id, project.id, 'does-not-exist-key', { name: 'x' }), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, apiKeyId: 'does-not-exist-key' }),
    });
    expect(response.status).toBe(404);
  });

  it('returns 400 for a blank name', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('rename-blank-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Rename Blank Org', ownerUserId: owner.id });
    const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
    const prodEnvironment = environments.find((e) => e.name === 'prod')!;
    const { apiKey } = await mintApiKey({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Original name',
      scopes: ['ingest.write'],
      createdByUserId: owner.id,
    });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const response = await PATCH(patchRequest(organization.id, project.id, apiKey.id, { name: '   ' }), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, apiKeyId: apiKey.id }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'name_required' });
  });

  it('renames an existing key', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('rename-happy-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Rename Happy Org', ownerUserId: owner.id });
    const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
    const prodEnvironment = environments.find((e) => e.name === 'prod')!;
    const { apiKey } = await mintApiKey({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Original name',
      scopes: ['ingest.write'],
      createdByUserId: owner.id,
    });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const response = await PATCH(patchRequest(organization.id, project.id, apiKey.id, { name: 'Updated name' }), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, apiKeyId: apiKey.id }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ apiKeyId: apiKey.id, name: 'Updated name' });
  });
});
