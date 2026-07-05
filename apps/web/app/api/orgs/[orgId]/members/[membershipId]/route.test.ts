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

function deleteParams(orgId: string, membershipId: string): Promise<{ orgId: string; membershipId: string }> {
  return Promise.resolve({ orgId, membershipId });
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
