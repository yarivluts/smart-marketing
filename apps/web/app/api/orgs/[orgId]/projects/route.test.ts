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

function projectRequest(orgId: string, body: unknown): { request: NextRequest; params: Promise<{ orgId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId }),
  };
}

describe('POST /api/orgs/[orgId]/projects', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = projectRequest('org-1', { name: 'Website' });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold project.manage (viewer)", async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('proj-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Proj Org', ownerUserId: owner.id });

    const viewerEmail = uniqueEmail('proj-viewer');
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
    const { request, params } = projectRequest(organization.id, { name: 'Website' });
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('rejects a request with no project name', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('proj-validation-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Validation Proj Org', ownerUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = projectRequest(organization.id, {});
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
  });

  it('lets an org_owner create a project with its fixed dev/staging/prod environments', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('proj-happy-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Happy Proj Org', ownerUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = projectRequest(organization.id, { name: 'Website' });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ projectId: expect.any(String) });
  });
});
