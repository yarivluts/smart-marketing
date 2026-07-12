import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createBoard,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  requestTvPairing,
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

async function setupOrgProjectBoard(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'War room', createdByUserId: owner.id });
  return { ownerSession, owner, organization, project, board };
}

function tvPairingRequest(
  orgId: string,
  projectId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/tv-pairing`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('GET /api/orgs/[orgId]/projects/[projectId]/tv-pairing', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = tvPairingRequest('org-1', 'project-1');
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = tvPairingRequest('does-not-exist-org', 'does-not-exist-project');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });

  it("rejects a member whose role doesn't hold dashboards.write (viewer)", async () => {
    const { organization, project, owner } = await setupOrgProjectBoard('TV Pairing List Org');
    const viewerEmail = uniqueEmail('tv-pairing-viewer');
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = tvPairingRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(403);
  });

  it('lets an org_owner list paired TVs (empty when none claimed yet)', async () => {
    const { ownerSession, organization, project } = await setupOrgProjectBoard('TV Pairing List Owner Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = tvPairingRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pairings: [] });
  });
});

describe('POST /api/orgs/[orgId]/projects/[projectId]/tv-pairing', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = tvPairingRequest('org-1', 'project-1', { code: 'ABCDEF', boardIds: ['b'], rotationSeconds: 30, reducedMotion: false, label: 'TV' });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('rejects a malformed body', async () => {
    const { ownerSession, organization, project } = await setupOrgProjectBoard('TV Pairing Claim Validation Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = tvPairingRequest(organization.id, project.id, { code: '', boardIds: [], rotationSeconds: 30, reducedMotion: false, label: '' });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
  });

  it('rejects an unknown pairing code', async () => {
    const { ownerSession, organization, project, board } = await setupOrgProjectBoard('TV Pairing Claim Bad Code Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = tvPairingRequest(organization.id, project.id, {
      code: 'ZZZZZZ',
      boardIds: [board.id],
      rotationSeconds: 30,
      reducedMotion: false,
      label: 'Office TV',
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_tv_pairing');
  });

  it('returns 429 with a Retry-After header once the same caller exhausts the claim-attempt bucket', async () => {
    const { ownerSession, organization, project, board } = await setupOrgProjectBoard('TV Pairing Claim Rate Limit Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    let lastResponse: Awaited<ReturnType<typeof POST>> | null = null;
    for (let i = 0; i < 25 && (!lastResponse || lastResponse.status !== 429); i += 1) {
      const { request, params } = tvPairingRequest(organization.id, project.id, {
        code: 'ZZZZZZ',
        boardIds: [board.id],
        rotationSeconds: 30,
        reducedMotion: false,
        label: 'Office TV',
      });
      lastResponse = await POST(request, { params });
    }

    expect(lastResponse!.status).toBe(429);
    expect(lastResponse!.headers.get('Retry-After')).toEqual(expect.any(String));
  });

  it('claims a real pairing code, then lists it', async () => {
    const { ownerSession, organization, project, board } = await setupOrgProjectBoard('TV Pairing Claim Org');
    const { code } = await requestTvPairing();
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = tvPairingRequest(organization.id, project.id, {
      code,
      boardIds: [board.id],
      rotationSeconds: 45,
      reducedMotion: true,
      label: 'Office lobby',
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { pairing: { id: string; label: string; boardIds: string[] } };
    expect(body.pairing).toMatchObject({ label: 'Office lobby', boardIds: [board.id] });

    const listResponse = await GET(tvPairingRequest(organization.id, project.id).request, { params });
    const listed = (await listResponse.json()) as { pairings: Array<{ id: string }> };
    expect(listed.pairings).toHaveLength(1);
    expect(listed.pairings[0].id).toBe(body.pairing.id);
  });
});
