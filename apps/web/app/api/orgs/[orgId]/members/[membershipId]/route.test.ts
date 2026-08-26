import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  ensureUserByEmail,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
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

function deleteParams(orgId: string, membershipId: string): Promise<{ orgId: string; membershipId: string }> {
  return Promise.resolve({ orgId, membershipId });
}

function patchRequest(role: string): Request {
  return new Request('https://growthos.test', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
}

describe('DELETE /api/orgs/[orgId]/members/[membershipId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await DELETE(new Request('https://growthos.test'), { params: deleteParams('org-1', 'm1') });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold members.manage (viewer)", async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('del-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Delete Perm Org', ownerUserId: owner.id });

    const viewerEmail = uniqueEmail('del-viewer');
    const viewerInvite = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: viewerEmail,
      role: 'viewer',
      invitedByUserId: owner.id,
    });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserByEmail(viewerEmail);
    await acceptInvite({
      organizationId: organization.id,
      membershipId: viewerInvite.id,
      userId: viewer.id,
      callerEmailVerified: true,
    });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const response = await DELETE(new Request('https://growthos.test'), {
      params: deleteParams(organization.id, viewerInvite.id),
    });
    expect(response.status).toBe(403);
  });

  it('returns 404 for a membership that does not exist', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('del-404-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: '404 Org', ownerUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await DELETE(new Request('https://growthos.test'), {
      params: deleteParams(organization.id, 'does-not-exist'),
    });
    expect(response.status).toBe(404);
  });

  it('returns 409 when removing the last active org_owner', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('del-last-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization, membership } = await createOrganizationWithOwner({ name: 'Last Owner Org', ownerUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await DELETE(new Request('https://growthos.test'), {
      params: deleteParams(organization.id, membership.id),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'last_owner' });
  });

  it('lets an org_owner revoke a pending invite', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('del-success-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Success Org', ownerUserId: owner.id });
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: uniqueEmail('del-success-invitee'),
      role: 'viewer',
      invitedByUserId: owner.id,
    });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await DELETE(new Request('https://growthos.test'), {
      params: deleteParams(organization.id, invitation.id),
    });
    expect(response.status).toBe(200);
  });
});

describe('PATCH /api/orgs/[orgId]/members/[membershipId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await PATCH(patchRequest('org_admin'), { params: deleteParams('org-1', 'm1') });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold members.manage (viewer)", async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('patch-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Patch Perm Org', ownerUserId: owner.id });

    const viewerEmail = uniqueEmail('patch-viewer');
    const viewerInvite = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: viewerEmail,
      role: 'viewer',
      invitedByUserId: owner.id,
    });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserByEmail(viewerEmail);
    await acceptInvite({
      organizationId: organization.id,
      membershipId: viewerInvite.id,
      userId: viewer.id,
      callerEmailVerified: true,
    });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const response = await PATCH(patchRequest('org_admin'), {
      params: deleteParams(organization.id, viewerInvite.id),
    });
    expect(response.status).toBe(403);
  });

  it('rejects a role outside org_admin/viewer in the request body', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('patch-bad-role-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization, membership } = await createOrganizationWithOwner({ name: 'Bad Role Org', ownerUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await PATCH(patchRequest('org_owner'), {
      params: deleteParams(organization.id, membership.id),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_role' });
  });

  it('returns 404 for a membership that does not exist', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('patch-404-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Patch 404 Org', ownerUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await PATCH(patchRequest('org_admin'), {
      params: deleteParams(organization.id, 'does-not-exist'),
    });
    expect(response.status).toBe(404);
  });

  it("returns 409 when the target membership's current role isn't changeable (org_owner)", async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('patch-owner-role-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization, membership } = await createOrganizationWithOwner({ name: 'Owner Role Org', ownerUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await PATCH(patchRequest('viewer'), {
      params: deleteParams(organization.id, membership.id),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'role_not_changeable' });
  });

  it('lets an org_owner change an active member from org_admin to viewer', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('patch-success-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Patch Success Org', ownerUserId: owner.id });

    const memberEmail = uniqueEmail('patch-success-member');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: memberEmail,
      role: 'org_admin',
      invitedByUserId: owner.id,
    });
    const member = await ensureUserByEmail(memberEmail);
    await acceptInvite({
      organizationId: organization.id,
      membershipId: invitation.id,
      userId: member.id,
      callerEmailVerified: true,
    });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const response = await PATCH(patchRequest('viewer'), {
      params: deleteParams(organization.id, invitation.id),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ role: 'viewer' });
  });
});
