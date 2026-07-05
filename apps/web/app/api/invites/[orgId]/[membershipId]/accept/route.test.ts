import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
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

function acceptParams(orgId: string, membershipId: string): Promise<{ orgId: string; membershipId: string }> {
  return Promise.resolve({ orgId, membershipId });
}

async function setUpInvite(): Promise<{ organizationId: string; membershipId: string; inviteeEmail: string }> {
  const ownerUid = unique('uid');
  const ownerEmail = uniqueEmail('accept-owner');
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerUid, email: ownerEmail });
  const { organization } = await createOrganizationWithOwner({ name: 'Accept Org', ownerUserId: owner.id });

  const inviteeEmail = uniqueEmail('accept-invitee');
  const invitation = await inviteMemberToOrganization({
    organizationId: organization.id,
    email: inviteeEmail,
    role: 'viewer',
    invitedByUserId: owner.id,
  });

  return { organizationId: organization.id, membershipId: invitation.id, inviteeEmail };
}

describe('POST /api/invites/[orgId]/[membershipId]/accept', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await POST(new Request('https://growthos.test'), { params: acceptParams('org-1', 'm1') });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a membership that does not exist', async () => {
    const uid = unique('uid');
    const email = uniqueEmail('missing');
    await ensureUserForFirebaseSession({ firebaseUid: uid, email });
    getServerSessionMock.mockResolvedValue({ uid, email, email_verified: true } as DecodedIdToken);

    const response = await POST(new Request('https://growthos.test'), {
      params: acceptParams('some-org', 'does-not-exist'),
    });
    expect(response.status).toBe(404);
  });

  it('returns 403 when the signed-in account does not match the invited email', async () => {
    const { organizationId, membershipId } = await setUpInvite();
    const impostorUid = unique('uid');
    const impostorEmail = uniqueEmail('impostor');
    await ensureUserForFirebaseSession({ firebaseUid: impostorUid, email: impostorEmail });
    getServerSessionMock.mockResolvedValue({ uid: impostorUid, email: impostorEmail, email_verified: true } as DecodedIdToken);

    const response = await POST(new Request('https://growthos.test'), { params: acceptParams(organizationId, membershipId) });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'email_mismatch' });
  });

  it("returns 403 when the caller's own account matches by email but hasn't verified it yet — the account-takeover gate", async () => {
    const { organizationId, membershipId, inviteeEmail } = await setUpInvite();
    const inviteeUid = unique('uid');
    // Resolving the session links to the invite's placeholder UserModel by
    // email (see ensureUserForFirebaseSession) — exactly the step an
    // attacker who merely knows the invitee's email could also reach.
    // Without the email_verified gate, this alone would be enough to accept.
    await ensureUserForFirebaseSession({ firebaseUid: inviteeUid, email: inviteeEmail });
    getServerSessionMock.mockResolvedValue({ uid: inviteeUid, email: inviteeEmail, email_verified: false } as DecodedIdToken);

    const response = await POST(new Request('https://growthos.test'), { params: acceptParams(organizationId, membershipId) });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'email_not_verified' });
  });

  it('accepts the invite once the caller is both an email match and verified, and rejects re-acceptance', async () => {
    const { organizationId, membershipId, inviteeEmail } = await setUpInvite();
    const inviteeUid = unique('uid');
    await ensureUserForFirebaseSession({ firebaseUid: inviteeUid, email: inviteeEmail });
    getServerSessionMock.mockResolvedValue({ uid: inviteeUid, email: inviteeEmail, email_verified: true } as DecodedIdToken);

    const response = await POST(new Request('https://growthos.test'), { params: acceptParams(organizationId, membershipId) });
    expect(response.status).toBe(200);

    const secondResponse = await POST(new Request('https://growthos.test'), {
      params: acceptParams(organizationId, membershipId),
    });
    expect(secondResponse.status).toBe(409);
    expect(await secondResponse.json()).toMatchObject({ error: 'already_resolved' });
  });
});
