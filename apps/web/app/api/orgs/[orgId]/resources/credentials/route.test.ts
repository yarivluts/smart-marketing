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

function credentialsRequest(
  orgId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/resources/credentials`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId }),
  };
}

describe('GET /api/orgs/[orgId]/resources/credentials', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = credentialsRequest('org-1');
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = credentialsRequest('does-not-exist-org');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });

  it('lets a viewer (zero explicit permissions) list credentials — reads are open to any active member', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('cred-list-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Cred List Org', ownerUserId: owner.id });

    const viewerEmail = uniqueEmail('cred-list-viewer');
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
    const { request, params } = credentialsRequest(organization.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ credentials: [] });
  });
});

describe('POST /api/orgs/[orgId]/resources/credentials', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = credentialsRequest('org-1', { name: 'Meta MCC', provider: 'meta_ads', availableScopes: [] });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold resources.manage (viewer)", async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('cred-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Cred Org', ownerUserId: owner.id });

    const viewerEmail = uniqueEmail('cred-viewer');
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
    const { request, params } = credentialsRequest(organization.id, {
      name: 'Meta MCC',
      provider: 'meta_ads',
      availableScopes: ['act_1'],
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('rejects an invalid provider and a non-array availableScopes', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('cred-validation-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Validation Cred Org', ownerUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const badProvider = credentialsRequest(organization.id, { name: 'X', provider: 'not_a_provider', availableScopes: [] });
    expect((await POST(badProvider.request, { params: badProvider.params })).status).toBe(400);

    const badScopes = credentialsRequest(organization.id, { name: 'X', provider: 'generic', availableScopes: 'not-an-array' });
    expect((await POST(badScopes.request, { params: badScopes.params })).status).toBe(400);
  });

  it('lets an org_owner create a shared credential', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('cred-happy-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Happy Cred Org', ownerUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = credentialsRequest(organization.id, {
      name: 'Agency Meta MCC',
      provider: 'meta_ads',
      availableScopes: ['act_1', 'act_2'],
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ credentialId: expect.any(String) });

    const listResponse = await GET(credentialsRequest(organization.id).request, { params });
    expect(await listResponse.json()).toMatchObject({
      credentials: [expect.objectContaining({ name: 'Agency Meta MCC', provider: 'meta_ads', availableScopes: ['act_1', 'act_2'] })],
    });
  });
});
