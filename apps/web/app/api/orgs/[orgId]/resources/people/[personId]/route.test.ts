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
import { POST as createPerson } from '../route';
import { DELETE, PATCH } from './route';

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

function patchRequest(orgId: string, personId: string, body: unknown): { request: NextRequest; params: Promise<{ orgId: string; personId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/resources/people/${personId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, personId }),
  };
}

async function setupOrgWithPerson(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail(orgName.toLowerCase().replace(/\s+/g, '-')));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  getServerSessionMock.mockResolvedValue(ownerSession);

  const createResponse = await createPerson(
    new NextRequest(`https://growthos.test/api/orgs/${organization.id}/resources/people`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Original Name', email: uniqueEmail('original'), title: 'Original Title' }),
    }),
    { params: Promise.resolve({ orgId: organization.id }) },
  );
  const { personId } = (await createResponse.json()) as { personId: string };

  return { ownerSession, owner, organization, personId };
}

describe('PATCH /api/orgs/[orgId]/resources/people/[personId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = patchRequest('org-1', 'person-1', { name: 'New Name' });
    expect((await PATCH(request, { params })).status).toBe(401);
  });

  it('rejects a member whose role does not hold resources.manage (viewer)', async () => {
    const { owner, organization, personId } = await setupOrgWithPerson('Edit Person Owner Org');

    const viewerEmail = uniqueEmail('edit-person-viewer');
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
    const { request, params } = patchRequest(organization.id, personId, { name: 'Hijacked Name' });
    expect((await PATCH(request, { params })).status).toBe(403);
  });

  it('rejects a request with no name', async () => {
    const { organization, personId } = await setupOrgWithPerson('Edit Person No Name Org');
    const { request, params } = patchRequest(organization.id, personId, {});
    expect((await PATCH(request, { params })).status).toBe(400);
  });

  it('rejects a non-string photoUrl', async () => {
    const { organization, personId } = await setupOrgWithPerson('Edit Person Photo Validation Org');
    const { request, params } = patchRequest(organization.id, personId, { name: 'X', photoUrl: 123 });
    expect((await PATCH(request, { params })).status).toBe(400);
  });

  it('returns 404 for a person id that does not exist in this org', async () => {
    const { organization } = await setupOrgWithPerson('Edit Person Missing Org');
    const { request, params } = patchRequest(organization.id, 'does-not-exist', { name: 'New Name' });
    expect((await PATCH(request, { params })).status).toBe(404);
  });

  it('lets an org_owner edit an existing person, clearing an omitted optional field', async () => {
    const { organization, personId } = await setupOrgWithPerson('Edit Person Happy Org');

    const { request, params } = patchRequest(organization.id, personId, {
      name: 'Updated Name',
      title: 'Updated Title',
      // email intentionally omitted — should clear the original value
    });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { person: { id: string; name: string; title?: string; email?: string } };
    expect(body.person).toMatchObject({ id: personId, name: 'Updated Name', title: 'Updated Title' });
    expect(body.person.email).toBeUndefined();
  });
});

describe('DELETE /api/orgs/[orgId]/resources/people/[personId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await DELETE(new Request('https://growthos.test'), { params: Promise.resolve({ orgId: 'org-1', personId: 'person-1' }) });
    expect(response.status).toBe(401);
  });

  it('rejects a member whose role does not hold resources.manage (viewer)', async () => {
    const { owner, organization, personId } = await setupOrgWithPerson('Archive Person Viewer Org');

    const viewerEmail = uniqueEmail('archive-person-viewer');
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const response = await DELETE(new Request('https://growthos.test'), { params: Promise.resolve({ orgId: organization.id, personId }) });
    expect(response.status).toBe(403);
  });

  it('archives an existing person', async () => {
    const { ownerSession, organization, personId } = await setupOrgWithPerson('Archive Person Happy Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await DELETE(new Request('https://growthos.test'), { params: Promise.resolve({ orgId: organization.id, personId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'archived' });
  });

  it('returns 404 for a person id that does not exist in this org', async () => {
    const { ownerSession, organization } = await setupOrgWithPerson('Archive Person Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await DELETE(new Request('https://growthos.test'), { params: Promise.resolve({ orgId: organization.id, personId: 'does-not-exist' }) });
    expect(response.status).toBe(404);
  });
});
