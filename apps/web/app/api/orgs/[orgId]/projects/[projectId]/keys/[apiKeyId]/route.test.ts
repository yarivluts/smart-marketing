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

/** Invites+accepts a project-scoped member (KAN-135) so a test can assert the KAN-136 gap is closed. */
async function inviteProjectScopedMember(
  organizationId: string,
  projectId: string,
  role: 'project_admin' | 'editor' | 'operator',
  invitedByUserId: string,
): Promise<DecodedIdToken> {
  const email = uniqueEmail(`project-${role}`);
  const invitation = await inviteMemberToOrganization({ organizationId, email, role, invitedByUserId, projectId });
  const session = await sessionFor(unique('uid'), email);
  const invitee = await ensureUserForFirebaseSession({ firebaseUid: session.uid, email });
  await acceptInvite({ organizationId, membershipId: invitation.id, userId: invitee.id, callerEmailVerified: true });
  return session;
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

  it('KAN-142: lets a project-scoped project_admin revoke a key in THEIR OWN project', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('revoke-project-scoped-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Revoke Project-Scoped Org', ownerUserId: owner.id });
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
    const memberSession = await inviteProjectScopedMember(organization.id, project.id, 'project_admin', owner.id);

    getServerSessionMock.mockResolvedValue(memberSession);
    const { request, params } = revokeRequest(organization.id, project.id, apiKey.id);
    const response = await DELETE(request, { params });
    expect(response.status).toBe(200);
  });

  it(
    "KAN-142 isolation: a project-scoped project_admin for one project still can't reach a SIBLING " +
      'project in the same org',
    async () => {
      const ownerSession = await sessionFor(unique('uid'), uniqueEmail('revoke-sibling-owner'));
      const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
      const { organization } = await createOrganizationWithOwner({ name: 'Revoke Sibling Project Org', ownerUserId: owner.id });
      const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
      const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other Project' });
      const memberSession = await inviteProjectScopedMember(organization.id, project.id, 'project_admin', owner.id);

      getServerSessionMock.mockResolvedValue(memberSession);
      const { request, params } = revokeRequest(organization.id, otherProject.id, 'some-key');
      const response = await DELETE(request, { params });
      expect(response.status).toBe(403);
    },
  );
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

  it('KAN-142: lets a project-scoped project_admin rename a key in THEIR OWN project', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('rename-project-scoped-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Rename Project-Scoped Org', ownerUserId: owner.id });
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
    const memberSession = await inviteProjectScopedMember(organization.id, project.id, 'project_admin', owner.id);

    getServerSessionMock.mockResolvedValue(memberSession);
    const response = await PATCH(patchRequest(organization.id, project.id, apiKey.id, { name: 'Updated name' }), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, apiKeyId: apiKey.id }),
    });
    expect(response.status).toBe(200);
  });

  it(
    "KAN-142 isolation: a project-scoped project_admin for one project still can't reach a SIBLING " +
      'project in the same org',
    async () => {
      const ownerSession = await sessionFor(unique('uid'), uniqueEmail('rename-sibling-owner'));
      const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
      const { organization } = await createOrganizationWithOwner({ name: 'Rename Sibling Project Org', ownerUserId: owner.id });
      const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
      const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other Project' });
      const memberSession = await inviteProjectScopedMember(organization.id, project.id, 'project_admin', owner.id);

      getServerSessionMock.mockResolvedValue(memberSession);
      const response = await PATCH(patchRequest(organization.id, otherProject.id, 'some-key', { name: 'x' }), {
        params: Promise.resolve({ orgId: organization.id, projectId: otherProject.id, apiKeyId: 'some-key' }),
      });
      expect(response.status).toBe(403);
    },
  );
});
