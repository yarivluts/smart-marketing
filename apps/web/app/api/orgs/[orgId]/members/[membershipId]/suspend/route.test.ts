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

function routeParams(orgId: string, membershipId: string): Promise<{ orgId: string; membershipId: string }> {
  return Promise.resolve({ orgId, membershipId });
}

describe('POST /api/orgs/[orgId]/members/[membershipId]/suspend', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await POST(new Request('https://growthos.test'), { params: routeParams('org-1', 'm1') });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold members.manage (viewer)", async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('suspend-perm-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Suspend Perm Org', ownerUserId: owner.id });

    const viewerEmail = uniqueEmail('suspend-perm-viewer');
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
    const response = await POST(new Request('https://growthos.test'), {
      params: routeParams(organization.id, viewerInvite.id),
    });
    expect(response.status).toBe(403);
  });

  it('returns 404 for a membership that does not exist', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('suspend-404-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Suspend 404 Org', ownerUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await POST(new Request('https://growthos.test'), {
      params: routeParams(organization.id, 'does-not-exist'),
    });
    expect(response.status).toBe(404);
  });

  it('returns 409 when suspending a pending invite', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('suspend-pending-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Suspend Pending Org', ownerUserId: owner.id });
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: uniqueEmail('suspend-pending-invitee'),
      role: 'viewer',
      invitedByUserId: owner.id,
    });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await POST(new Request('https://growthos.test'), {
      params: routeParams(organization.id, invitation.id),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'not_active' });
  });

  it('returns 409 when suspending the last active org_owner', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('suspend-last-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization, membership } = await createOrganizationWithOwner({ name: 'Suspend Last Owner Org', ownerUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await POST(new Request('https://growthos.test'), {
      params: routeParams(organization.id, membership.id),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'last_owner' });
  });

  it('lets an org_owner suspend an active member', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('suspend-success-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Suspend Success Org', ownerUserId: owner.id });

    const memberEmail = uniqueEmail('suspend-success-member');
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
    const response = await POST(new Request('https://growthos.test'), {
      params: routeParams(organization.id, invitation.id),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'suspended' });
  });
});
