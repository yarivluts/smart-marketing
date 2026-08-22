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

function killSwitchUrl(orgId: string): string {
  return `https://growthos.test/api/orgs/${orgId}/automation/kill-switch`;
}

function getRequest(orgId: string): { request: NextRequest; params: Promise<{ orgId: string }> } {
  return {
    request: new NextRequest(killSwitchUrl(orgId), { method: 'GET' }),
    params: Promise.resolve({ orgId }),
  };
}

function postRequest(orgId: string, body: string): { request: NextRequest; params: Promise<{ orgId: string }> } {
  return {
    request: new NextRequest(killSwitchUrl(orgId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    params: Promise.resolve({ orgId }),
  };
}

async function setupOrg(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  return { ownerSession, owner, organization };
}

async function setupViewerSession(organizationId: string, ownerId: string): Promise<DecodedIdToken> {
  const viewerEmail = uniqueEmail('viewer');
  const invitation = await inviteMemberToOrganization({
    organizationId,
    email: viewerEmail,
    role: 'viewer',
    invitedByUserId: ownerId,
  });
  const viewerSession = await sessionFor(unique('uid'), viewerEmail);
  const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
  await acceptInvite({ organizationId, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });
  return viewerSession;
}

describe('GET /api/orgs/[orgId]/automation/kill-switch', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = getRequest('org-1');
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold automation.execute (viewer)", async () => {
    const { owner, organization } = await setupOrg('Kill Switch GET Viewer Org');
    const viewerSession = await setupViewerSession(organization.id, owner.id);

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = getRequest(organization.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 404 not_found for an org the caller has no active membership in', async () => {
    const { ownerSession } = await setupOrg('Kill Switch GET No Membership Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = getRequest('does-not-exist');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('returns disengaged for an org with no kill-switch events yet', async () => {
    const { ownerSession, organization } = await setupOrg('Kill Switch GET Default Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = getRequest(organization.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ engaged: false });
  });

  it('reflects the engaged state and reason after the switch has been engaged', async () => {
    const { ownerSession, owner, organization } = await setupOrg('Kill Switch GET Engaged Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const engage = postRequest(organization.id, JSON.stringify({ engaged: true, reason: 'Runaway spend incident' }));
    const engageResponse = await POST(engage.request, { params: engage.params });
    expect(engageResponse.status).toBe(201);

    const { request, params } = getRequest(organization.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      engaged: true,
      reason: 'Runaway spend incident',
      engagedAt: expect.any(String),
      engagedByUserId: owner.id,
    });
  });
});

describe('POST /api/orgs/[orgId]/automation/kill-switch', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = postRequest('org-1', JSON.stringify({ engaged: false }));
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold automation.execute (viewer)", async () => {
    const { owner, organization } = await setupOrg('Kill Switch POST Viewer Org');
    const viewerSession = await setupViewerSession(organization.id, owner.id);

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = postRequest(organization.id, JSON.stringify({ engaged: false }));
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 404 not_found for an org the caller has no active membership in', async () => {
    const { ownerSession } = await setupOrg('Kill Switch POST No Membership Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest('does-not-exist', JSON.stringify({ engaged: false }));
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('returns 400 invalid_json for a malformed body', async () => {
    const { ownerSession, organization } = await setupOrg('Kill Switch POST Bad JSON Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, '{not json');
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_json' });
  });

  it('returns 400 engaged_required when engaged is missing', async () => {
    const { ownerSession, organization } = await setupOrg('Kill Switch POST Missing Engaged Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, JSON.stringify({ reason: 'Incident' }));
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'engaged_required' });
  });

  it('returns 400 engaged_required when engaged is the wrong type', async () => {
    const { ownerSession, organization } = await setupOrg('Kill Switch POST Wrong Type Engaged Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, JSON.stringify({ engaged: 'true' }));
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'engaged_required' });
  });

  it('returns 400 reason_required when engaging without a reason', async () => {
    const { ownerSession, organization } = await setupOrg('Kill Switch POST Missing Reason Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, JSON.stringify({ engaged: true }));
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'reason_required' });
  });

  it('returns 400 reason_required when engaging with a blank reason', async () => {
    const { ownerSession, organization } = await setupOrg('Kill Switch POST Blank Reason Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, JSON.stringify({ engaged: true, reason: '   ' }));
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'reason_required' });
  });

  it('engages the kill switch, trimming the reason, and returns 201', async () => {
    const { ownerSession, owner, organization } = await setupOrg('Kill Switch POST Engage Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, JSON.stringify({ engaged: true, reason: '  Runaway spend  ' }));
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      engaged: true,
      reason: 'Runaway spend',
      engagedByUserId: owner.id,
    });
  });

  it('disengages the kill switch (no reason required) and returns 201', async () => {
    const { ownerSession, organization } = await setupOrg('Kill Switch POST Disengage Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const engage = postRequest(organization.id, JSON.stringify({ engaged: true, reason: 'Incident' }));
    await POST(engage.request, { params: engage.params });

    const { request, params } = postRequest(organization.id, JSON.stringify({ engaged: false }));
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ engaged: false });

    const getResult = getRequest(organization.id);
    const getResponse = await GET(getResult.request, { params: getResult.params });
    expect(await getResponse.json()).toEqual({ engaged: false });
  });

  it('ignores a stray reason field when disengaging', async () => {
    const { ownerSession, organization } = await setupOrg('Kill Switch POST Disengage With Reason Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, JSON.stringify({ engaged: false, reason: 'ignored' }));
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ engaged: false });
  });
});
