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
import { POST as createCredential } from '../route';
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

function patchRequest(orgId: string, credentialId: string, body: unknown): { request: NextRequest; params: Promise<{ orgId: string; credentialId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/resources/credentials/${credentialId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, credentialId }),
  };
}

async function setupOrgWithCredential(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail(orgName.toLowerCase().replace(/\s+/g, '-')));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  getServerSessionMock.mockResolvedValue(ownerSession);

  const createResponse = await createCredential(
    new NextRequest(`https://growthos.test/api/orgs/${organization.id}/resources/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Original Credential', provider: 'meta_ads', availableScopes: ['act_1'] }),
    }),
    { params: Promise.resolve({ orgId: organization.id }) },
  );
  const { credentialId } = (await createResponse.json()) as { credentialId: string };

  return { ownerSession, owner, organization, credentialId };
}

describe('PATCH /api/orgs/[orgId]/resources/credentials/[credentialId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = patchRequest('org-1', 'credential-1', { name: 'New Name', availableScopes: [] });
    expect((await PATCH(request, { params })).status).toBe(401);
  });

  it('rejects a member whose role does not hold resources.manage (viewer)', async () => {
    const { owner, organization, credentialId } = await setupOrgWithCredential('Edit Credential Owner Org');

    const viewerEmail = uniqueEmail('edit-credential-viewer');
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
    const { request, params } = patchRequest(organization.id, credentialId, { name: 'Hijacked Name', availableScopes: [] });
    expect((await PATCH(request, { params })).status).toBe(403);
  });

  it('rejects a request with no name', async () => {
    const { organization, credentialId } = await setupOrgWithCredential('Edit Credential No Name Org');
    const { request, params } = patchRequest(organization.id, credentialId, { availableScopes: [] });
    expect((await PATCH(request, { params })).status).toBe(400);
  });

  it('rejects a non-array availableScopes', async () => {
    const { organization, credentialId } = await setupOrgWithCredential('Edit Credential Scopes Validation Org');
    const { request, params } = patchRequest(organization.id, credentialId, { name: 'X', availableScopes: 'not-an-array' });
    expect((await PATCH(request, { params })).status).toBe(400);
  });

  it('rejects an availableScopes array with a non-string entry', async () => {
    const { organization, credentialId } = await setupOrgWithCredential('Edit Credential Scopes Entry Org');
    const { request, params } = patchRequest(organization.id, credentialId, { name: 'X', availableScopes: ['act_1', 42] });
    expect((await PATCH(request, { params })).status).toBe(400);
  });

  it('returns 404 for a credential id that does not exist in this org', async () => {
    const { organization } = await setupOrgWithCredential('Edit Credential Missing Org');
    const { request, params } = patchRequest(organization.id, 'does-not-exist', { name: 'New Name', availableScopes: [] });
    expect((await PATCH(request, { params })).status).toBe(404);
  });

  it("lets an org_owner edit a credential's name and available scopes, never touching its provider", async () => {
    const { organization, credentialId } = await setupOrgWithCredential('Edit Credential Happy Org');

    const { request, params } = patchRequest(organization.id, credentialId, {
      name: 'Renamed Credential',
      availableScopes: ['act_2', 'act_3'],
    });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      credential: { id: string; name: string; provider: string; availableScopes: string[] };
    };
    expect(body.credential).toMatchObject({
      id: credentialId,
      name: 'Renamed Credential',
      provider: 'meta_ads',
      availableScopes: ['act_2', 'act_3'],
    });
  });

  it('replaces the scope list wholesale, clearing to an empty array when none are sent', async () => {
    const { organization, credentialId } = await setupOrgWithCredential('Edit Credential Clear Scopes Org');

    const { request, params } = patchRequest(organization.id, credentialId, { name: 'Original Credential', availableScopes: [] });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { credential: { availableScopes: string[] } };
    expect(body.credential.availableScopes).toEqual([]);
  });
});
