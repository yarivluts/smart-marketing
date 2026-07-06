import { randomBytes } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  createOrganizationWithOwner,
  createSharedCredential,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  acceptInvite,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { PUT as setSecret } from '../route';
import { POST } from './route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  process.env.GROWTHOS_VAULT_KEYS = JSON.stringify({
    currentKeyId: 'v1',
    keys: { v1: randomBytes(32).toString('base64') },
  });
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

function rotateRequest(
  orgId: string,
  credentialId: string,
): { request: NextRequest; params: Promise<{ orgId: string; credentialId: string }> } {
  return {
    request: new NextRequest(
      `https://growthos.test/api/orgs/${orgId}/resources/credentials/${credentialId}/secret/rotate`,
      { method: 'POST' },
    ),
    params: Promise.resolve({ orgId, credentialId }),
  };
}

describe('POST /api/orgs/[orgId]/resources/credentials/[credentialId]/secret/rotate', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = rotateRequest('org-1', 'cred-1');
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold resources.manage (viewer)", async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('rotate-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Rotate Route Org', ownerUserId: owner.id });
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Agency Meta MCC',
      provider: 'meta_ads',
      availableScopes: ['act_1'],
      createdByUserId: owner.id,
    });

    const viewerEmail = uniqueEmail('rotate-viewer');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: viewerEmail,
      role: 'viewer',
      invitedByUserId: owner.id,
    });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = rotateRequest(organization.id, credential.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 409 when the credential has no secret set yet', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('rotate-unset-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Rotate Unset Org', ownerUserId: owner.id });
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Agency Meta MCC',
      provider: 'meta_ads',
      availableScopes: ['act_1'],
      createdByUserId: owner.id,
    });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = rotateRequest(organization.id, credential.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(409);
  });

  it('rotates an already-set secret and it still reveals to the same plaintext', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('rotate-happy-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Rotate Happy Org', ownerUserId: owner.id });
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Agency Meta MCC',
      provider: 'meta_ads',
      availableScopes: ['act_1'],
      createdByUserId: owner.id,
    });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const setRequest = new NextRequest(
      `https://growthos.test/api/orgs/${organization.id}/resources/credentials/${credential.id}/secret`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: 'sk_live_rotate-me' }) },
    );
    const setResponse = await setSecret(setRequest, { params: Promise.resolve({ orgId: organization.id, credentialId: credential.id }) });
    expect(setResponse.status).toBe(200);

    const { request, params } = rotateRequest(organization.id, credential.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'rotated' });
  });
});
