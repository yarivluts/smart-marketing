import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { GET, POST } from './route';

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

function attachmentsRequest(
  orgId: string,
  projectId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/resource-attachments`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/resource-attachments', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = attachmentsRequest('org-1', 'project-1', {
      resourceKind: 'credential',
      resourceId: 'cred-1',
      scopeSelection: ['act_1'],
    });
    expect((await POST(request, { params })).status).toBe(401);
  });

  it("rejects a member whose role doesn't hold project.manage (viewer)", async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('attach-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Attach Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Project A' });
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Cred',
      provider: 'generic',
      availableScopes: ['scope-1'],
      createdByUserId: owner.id,
    });

    const viewerEmail = uniqueEmail('attach-viewer');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: viewerEmail,
      role: 'viewer',
      invitedByUserId: owner.id,
    });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({
      organizationId: organization.id,
      membershipId: invitation.id,
      userId: viewer.id,
      callerEmailVerified: true,
    });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = attachmentsRequest(organization.id, project.id, {
      resourceKind: 'credential',
      resourceId: credential.id,
      scopeSelection: ['scope-1'],
    });
    expect((await POST(request, { params })).status).toBe(403);
  });

  it('rejects an invalid resource kind and a scope selection outside the credential\'s available scopes', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('attach-validation-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Validation Attach Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Project A' });
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Cred',
      provider: 'generic',
      availableScopes: ['scope-1'],
      createdByUserId: owner.id,
    });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const badKind = attachmentsRequest(organization.id, project.id, { resourceKind: 'not_a_kind', resourceId: credential.id });
    expect((await POST(badKind.request, { params: badKind.params })).status).toBe(400);

    const badScope = attachmentsRequest(organization.id, project.id, {
      resourceKind: 'credential',
      resourceId: credential.id,
      scopeSelection: ['not-granted'],
    });
    expect((await POST(badScope.request, { params: badScope.params })).status).toBe(400);
  });

  it('returns 404 when the resource does not belong to this org', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('attach-cross-org-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization: orgA } = await createOrganizationWithOwner({ name: 'Org A', ownerUserId: owner.id });
    const { organization: orgB } = await createOrganizationWithOwner({ name: 'Org B', ownerUserId: owner.id });
    const { project: projectInOrgA } = await createProject({ organizationId: orgA.id, name: 'Project A' });
    const credentialInOrgB = await createSharedCredential({
      organizationId: orgB.id,
      name: 'Org B Cred',
      provider: 'generic',
      availableScopes: ['scope-1'],
      createdByUserId: owner.id,
    });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = attachmentsRequest(orgA.id, projectInOrgA.id, {
      resourceKind: 'credential',
      resourceId: credentialInOrgB.id,
      scopeSelection: ['scope-1'],
    });
    expect((await POST(request, { params })).status).toBe(404);
  });

  it('lets an org_owner request an attachment, visible via the GET list', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('attach-happy-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Happy Attach Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Project A' });
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Cred',
      provider: 'generic',
      availableScopes: ['scope-1', 'scope-2'],
      createdByUserId: owner.id,
    });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = attachmentsRequest(organization.id, project.id, {
      resourceKind: 'credential',
      resourceId: credential.id,
      scopeSelection: ['scope-1'],
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ attachmentId: expect.any(String) });

    const listResponse = await GET(attachmentsRequest(organization.id, project.id).request, { params });
    expect(await listResponse.json()).toMatchObject({
      attachments: [
        expect.objectContaining({ resourceKind: 'credential', resourceId: credential.id, status: 'pending', scopeSelection: ['scope-1'] }),
      ],
    });
  });
});
