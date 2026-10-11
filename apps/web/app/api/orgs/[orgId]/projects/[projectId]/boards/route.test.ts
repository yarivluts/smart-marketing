import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
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

async function setupOrgProject(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { ownerSession, organization, project };
}

/** Invites+accepts a project-scoped member (KAN-135) so a test can assert the KAN-136 gap is closed. */
async function inviteProjectScopedMember(
  organizationId: string,
  projectId: string,
  role: 'project_admin' | 'editor' | 'operator',
  invitedByUserId: string,
): Promise<DecodedIdToken> {
  const email = uniqueEmail(`project-${role}`);
  const invitation = await inviteMemberToOrganization({ organizationId, email, role, invitedByUserId, projectId });
  const session = await sessionFor(unique('uid'), email);
  const invitee = await ensureUserForFirebaseSession({ firebaseUid: session.uid, email });
  await acceptInvite({ organizationId, membershipId: invitation.id, userId: invitee.id, callerEmailVerified: true });
  return session;
}

function boardsRequest(
  orgId: string,
  projectId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/boards`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('GET /api/orgs/[orgId]/projects/[projectId]/boards', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = boardsRequest('org-1', 'project-1');
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = boardsRequest('does-not-exist-org', 'does-not-exist-project');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });

  it("rejects a member whose role doesn't hold dashboards.write (viewer)", async () => {
    const { organization, project } = await setupOrgProject('Board List Org');
    const viewerEmail = uniqueEmail('board-list-viewer');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('board-list-owner-2') });
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = boardsRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(403);
  });

  it('lets an org_owner list boards for the project (empty when none created yet)', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Board List Owner Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = boardsRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ boards: [] });
  });

  it("returns 404 for a project id that doesn't belong to this org", async () => {
    const { ownerSession, organization } = await setupOrgProject('Board List Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = boardsRequest(organization.id, 'does-not-exist-project');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });

  it(
    'KAN-136: lets a project-scoped project_admin list boards for THEIR OWN project — before this ' +
      'fix a project-scoped binding never satisfied this route\'s permission check at all',
    async () => {
      const { ownerSession, organization, project } = await setupOrgProject('Board List Project-Scoped Org');
      const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
      const memberSession = await inviteProjectScopedMember(organization.id, project.id, 'project_admin', owner.id);

      getServerSessionMock.mockResolvedValue(memberSession);
      const { request, params } = boardsRequest(organization.id, project.id);
      const response = await GET(request, { params });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ boards: [] });
    },
  );

  it(
    "KAN-136 isolation: a project-scoped project_admin for one project still can't reach a SIBLING " +
      'project in the same org — a project-scope binding never grants access sideways',
    async () => {
      const { ownerSession, organization, project } = await setupOrgProject('Board List Sibling Project Org');
      const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
      const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other Project' });
      const memberSession = await inviteProjectScopedMember(organization.id, project.id, 'project_admin', owner.id);

      getServerSessionMock.mockResolvedValue(memberSession);
      const { request, params } = boardsRequest(organization.id, otherProject.id);
      const response = await GET(request, { params });
      expect(response.status).toBe(403);
    },
  );
});

describe('POST /api/orgs/[orgId]/projects/[projectId]/boards', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = boardsRequest('org-1', 'project-1', { name: 'Marketing' });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('rejects an empty name', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Board Create Validation Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = boardsRequest(organization.id, project.id, { name: '   ' });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
  });

  it('creates a board, then lists it', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Board Create Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = boardsRequest(organization.id, project.id, { name: 'Marketing' });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { board: { id: string; name: string; tileCount: number } };
    expect(body.board).toMatchObject({ name: 'Marketing', tileCount: 0 });

    const listResponse = await GET(boardsRequest(organization.id, project.id).request, { params });
    const listed = (await listResponse.json()) as { boards: Array<{ id: string }> };
    expect(listed.boards).toHaveLength(1);
    expect(listed.boards[0].id).toBe(body.board.id);
  });

  it('KAN-136: lets a project-scoped editor create a board in THEIR OWN project', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Board Create Project-Scoped Org');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const memberSession = await inviteProjectScopedMember(organization.id, project.id, 'editor', owner.id);

    getServerSessionMock.mockResolvedValue(memberSession);
    const { request, params } = boardsRequest(organization.id, project.id, { name: 'Revenue' });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
  });
});
