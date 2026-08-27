import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { NextRequest } from 'next/server';
import { acceptInvite, createOrganizationWithOwner, ensureUserForFirebaseSession, inviteMemberToOrganization } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { PATCH } from './route';

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

async function setupOrg(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  return { owner, ownerSession, organization };
}

function patchRequest(orgId: string, body: unknown): NextRequest {
  return new NextRequest(`https://growthos.test/api/orgs/${orgId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/orgs/[orgId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await PATCH(patchRequest('org-1', { name: 'x' }), {
      params: Promise.resolve({ orgId: 'org-1' }),
    });
    expect(response.status).toBe(401);
  });

  it('returns 404 for an org the caller has no active membership in', async () => {
    getServerSessionMock.mockResolvedValue(await sessionFor(unique('uid'), uniqueEmail('stranger')));
    const response = await PATCH(patchRequest('does-not-exist', { name: 'x' }), {
      params: Promise.resolve({ orgId: 'does-not-exist' }),
    });
    expect(response.status).toBe(404);
  });

  it("rejects a member whose role doesn't hold billing.manage (org_admin)", async () => {
    const { owner, organization } = await setupOrg('Org Settings Route Admin Org');
    const adminEmail = uniqueEmail('org-settings-route-admin');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: adminEmail,
      role: 'org_admin',
      invitedByUserId: owner.id,
    });
    const adminSession = await sessionFor(unique('uid'), adminEmail);
    const admin = await ensureUserForFirebaseSession({ firebaseUid: adminSession.uid, email: adminEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: admin.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(adminSession);
    const response = await PATCH(patchRequest(organization.id, { name: 'Should not stick' }), {
      params: Promise.resolve({ orgId: organization.id }),
    });
    expect(response.status).toBe(403);
  });

  it('returns 400 when name is missing or blank', async () => {
    const { ownerSession, organization } = await setupOrg('Org Settings Route Blank Name Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await PATCH(patchRequest(organization.id, { name: '   ' }), {
      params: Promise.resolve({ orgId: organization.id }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'name_required' });
  });

  it('edits the organization and returns the updated view', async () => {
    const { ownerSession, organization } = await setupOrg('Org Settings Route Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await PATCH(
      patchRequest(organization.id, { name: 'Renamed Org', slug: 'renamed-org', billingEmail: 'billing@example.com' }),
      { params: Promise.resolve({ orgId: organization.id }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { organization: { name: string; slug: string; billingEmail: string } };
    expect(body.organization.name).toBe('Renamed Org');
    expect(body.organization.slug).toBe('renamed-org');
    expect(body.organization.billingEmail).toBe('billing@example.com');
  });
});
