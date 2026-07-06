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
import { PUT } from './route';

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

function secretRequest(
  orgId: string,
  credentialId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; credentialId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/resources/credentials/${credentialId}/secret`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? { secret: 'sk_live_test-secret' }),
    }),
    params: Promise.resolve({ orgId, credentialId }),
  };
}

describe('PUT /api/orgs/[orgId]/resources/credentials/[credentialId]/secret', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = secretRequest('org-1', 'cred-1');
    const response = await PUT(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold resources.manage (viewer)", async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('secret-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Secret Route Org', ownerUserId: owner.id });
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Agency Meta MCC',
      provider: 'meta_ads',
      availableScopes: ['act_1'],
      createdByUserId: owner.id,
    });

    const viewerEmail = uniqueEmail('secret-viewer');
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
    const { request, params } = secretRequest(organization.id, credential.id);
    const response = await PUT(request, { params });
    expect(response.status).toBe(403);
  });

  it('rejects a missing/empty secret', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('secret-validation-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Validation Secret Org', ownerUserId: owner.id });
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Agency Meta MCC',
      provider: 'meta_ads',
      availableScopes: ['act_1'],
      createdByUserId: owner.id,
    });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const missing = secretRequest(organization.id, credential.id, {});
    expect((await PUT(missing.request, { params: missing.params })).status).toBe(400);

    const blank = secretRequest(organization.id, credential.id, { secret: '   ' });
    expect((await PUT(blank.request, { params: blank.params })).status).toBe(400);
  });

  it('rejects a credential id that does not belong to the org', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('secret-missing-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Missing Cred Secret Org', ownerUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = secretRequest(organization.id, 'does-not-exist');
    const response = await PUT(request, { params });
    expect(response.status).toBe(404);
  });

  it('lets an org_owner set a secret, and reports 500 when the vault is not configured', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('secret-happy-owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: 'Happy Secret Org', ownerUserId: owner.id });
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Agency Meta MCC',
      provider: 'meta_ads',
      availableScopes: ['act_1'],
      createdByUserId: owner.id,
    });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = secretRequest(organization.id, credential.id);
    const response = await PUT(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'set' });

    const previousVaultKeys = process.env.GROWTHOS_VAULT_KEYS;
    delete process.env.GROWTHOS_VAULT_KEYS;
    try {
      const unconfigured = secretRequest(organization.id, credential.id);
      const unconfiguredResponse = await PUT(unconfigured.request, { params: unconfigured.params });
      expect(unconfiguredResponse.status).toBe(500);
    } finally {
      process.env.GROWTHOS_VAULT_KEYS = previousVaultKeys;
    }
  });
});
