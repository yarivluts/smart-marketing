import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
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

  it("rejects a caller with no membership in the org at all", async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = inviteRequest('does-not-exist-org', { email: 'a@b.com', role: 'viewer' });
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
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

  it('rejects a missing email and an uninvitable role', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('validation-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Validation Org', ownerUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const missingEmail = inviteRequest(organization.id, { role: 'viewer' });
    expect((await POST(missingEmail.request, { params: missingEmail.params })).status).toBe(400);

    // project_admin's scope level is 'project', not 'org' — an org-level
    // invite can only grant a role whose scope includes 'org' (see
    // INVITABLE_ROLES; this is the privilege-escalation bug the PR's own
    // self-review already found and fixed for this exact role).
    const badRole = inviteRequest(organization.id, { email: uniqueEmail('x'), role: 'project_admin' });
    expect((await POST(badRole.request, { params: badRole.params })).status).toBe(400);
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
});
