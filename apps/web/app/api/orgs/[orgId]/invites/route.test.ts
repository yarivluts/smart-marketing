import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { POST } from './route';

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

function inviteRequest(orgId: string, body: unknown): { request: NextRequest; params: Promise<{ orgId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId }),
  };
}

describe('POST /api/orgs/[orgId]/invites', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = inviteRequest('org-1', { email: 'a@b.com', role: 'viewer' });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a caller with no membership in the org at all with 404, not 403 (KAN-26 non-enumeration)", async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = inviteRequest('does-not-exist-org', { email: 'a@b.com', role: 'viewer' });
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: 'not_found' });
  });

  it("rejects a member whose role doesn't hold members.manage (viewer)", async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('inviter-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Viewer Org', ownerUserId: owner.id });

    const viewerEmail = uniqueEmail('viewer-member');
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
    const { request, params } = inviteRequest(organization.id, { email: uniqueEmail('nope'), role: 'viewer' });
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('rejects a missing email and a genuinely uninvitable role', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('validation-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Validation Org', ownerUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const missingEmail = inviteRequest(organization.id, { role: 'viewer' });
    expect((await POST(missingEmail.request, { params: missingEmail.params })).status).toBe(400);

    // org_owner is never handed out by invite at all — see INVITABLE_ROLES'/
    // PROJECT_INVITABLE_ROLES' own doc comments (roles.ts).
    const badRole = inviteRequest(organization.id, { email: uniqueEmail('x'), role: 'org_owner' });
    const badRoleResponse = await POST(badRole.request, { params: badRole.params });
    expect(badRoleResponse.status).toBe(400);
    expect(await badRoleResponse.json()).toMatchObject({ error: 'invalid_role' });
  });

  it('rejects a project-scoped role (project_admin/editor/operator) invited without a projectId (KAN-135)', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('proj-missing-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Project Missing Org', ownerUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    // project_admin's typical scope is 'project', not 'org' — an org-level
    // invite with no projectId can only grant a role whose scope includes
    // 'org' (this is the exact privilege-escalation shape KAN-25's own
    // review caught and INVITABLE_ROLES exists to prevent).
    const { request, params } = inviteRequest(organization.id, { email: uniqueEmail('x'), role: 'project_admin' });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'project_required' });
  });

  it('rejects an org-scoped role (org_admin/viewer) invited with a projectId', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('proj-notallowed-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Project Not Allowed Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = inviteRequest(organization.id, {
      email: uniqueEmail('x'),
      role: 'viewer',
      projectId: project.id,
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'project_not_allowed' });
  });

  it('rejects a project-scoped invite naming a project that belongs to a different org, with 404 not 403 (KAN-26 non-enumeration)', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('cross-org-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Cross Org Inviter Org', ownerUserId: owner.id });

    const otherOwner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('other-org-owner') });
    const { organization: otherOrg } = await createOrganizationWithOwner({ name: 'Other Org', ownerUserId: otherOwner.id });
    const { project: otherOrgProject } = await createProject({ organizationId: otherOrg.id, name: 'Other Org Project' });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = inviteRequest(organization.id, {
      email: uniqueEmail('x'),
      role: 'editor',
      projectId: otherOrgProject.id,
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: 'project_not_found' });
  });

  it("rejects a project-scoped project_admin (bound only to their own project) from inviting via this org-level route at all — members.manage is org-scope only", async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('scoped-inviter-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Scoped Inviter Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });

    const projectAdminEmail = uniqueEmail('project-admin-inviter');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: projectAdminEmail,
      role: 'project_admin',
      invitedByUserId: owner.id,
      projectId: project.id,
    });
    const projectAdminSession = await sessionFor(unique('uid'), projectAdminEmail);
    const projectAdmin = await ensureUserForFirebaseSession({ firebaseUid: projectAdminSession.uid, email: projectAdminEmail });
    await acceptInvite({
      organizationId: organization.id,
      membershipId: invitation.id,
      userId: projectAdmin.id,
      callerEmailVerified: true,
    });

    getServerSessionMock.mockResolvedValue(projectAdminSession);
    const { request, params } = inviteRequest(organization.id, { email: uniqueEmail('nope'), role: 'viewer' });
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('lets an org_owner invite a new member and rejects a duplicate invite to the same email', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('happy-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Happy Org', ownerUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const inviteeEmail = uniqueEmail('happy-invitee');
    const first = inviteRequest(organization.id, { email: inviteeEmail, role: 'viewer' });
    const firstResponse = await POST(first.request, { params: first.params });
    expect(firstResponse.status).toBe(201);
    expect(await firstResponse.json()).toMatchObject({ membershipId: expect.any(String) });

    const second = inviteRequest(organization.id, { email: inviteeEmail, role: 'org_admin' });
    const secondResponse = await POST(second.request, { params: second.params });
    expect(secondResponse.status).toBe(409);
  });

  it('lets an org_owner invite a project_admin scoped to a project in their org (KAN-135)', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('proj-happy-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Project Happy Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = inviteRequest(organization.id, {
      email: uniqueEmail('proj-happy-invitee'),
      role: 'project_admin',
      projectId: project.id,
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ membershipId: expect.any(String) });
  });
});
