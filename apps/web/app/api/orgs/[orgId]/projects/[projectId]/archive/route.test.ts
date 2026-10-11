import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  listOrgProjects,
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

async function sessionFor(firebaseUid: string, email: string): Promise<DecodedIdToken> {
  await ensureUserForFirebaseSession({ firebaseUid, email });
  return { uid: firebaseUid, email } as DecodedIdToken;
}

function postRequest(orgId: string, projectId: string, body: string) {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/archive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

async function setupOrgWithProject(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), `${unique('owner')}@example.com`);
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { ownerSession, owner, organization, project };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/archive', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = postRequest('org-1', 'project-1', JSON.stringify({ archived: true }));
    expect((await POST(request, { params })).status).toBe(401);
  });

  it("rejects a member whose role doesn't hold project.manage (viewer)", async () => {
    const { owner, organization, project } = await setupOrgWithProject('Archive Viewer Org');
    const viewerEmail = `${unique('viewer')}@example.com`;
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = postRequest(organization.id, project.id, JSON.stringify({ archived: true }));
    expect((await POST(request, { params })).status).toBe(403);
  });

  it('returns 400 archived_required when the flag is missing or not a boolean', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Archive Bad Body Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = postRequest(organization.id, project.id, JSON.stringify({ archived: 'yes' }));
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'archived_required' });
  });

  it('returns 404 for a project that does not exist in the org', async () => {
    const { ownerSession, organization } = await setupOrgWithProject('Archive Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = postRequest(organization.id, 'does-not-exist', JSON.stringify({ archived: true }));
    expect((await POST(request, { params })).status).toBe(404);
  });

  it('archives then unarchives: the project leaves and rejoins the live listing', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Archive Round Trip Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const archive = postRequest(organization.id, project.id, JSON.stringify({ archived: true }));
    const archiveResponse = await POST(archive.request, { params: archive.params });
    expect(archiveResponse.status).toBe(200);
    expect(((await archiveResponse.json()) as { project: { archivedAt: string | null } }).project.archivedAt).toEqual(expect.any(String));
    expect(await listOrgProjects(organization.id)).toHaveLength(0);

    const restore = postRequest(organization.id, project.id, JSON.stringify({ archived: false }));
    const restoreResponse = await POST(restore.request, { params: restore.params });
    expect(restoreResponse.status).toBe(200);
    expect(((await restoreResponse.json()) as { project: { archivedAt: string | null } }).project.archivedAt).toBeNull();
    expect((await listOrgProjects(organization.id)).map((candidate) => candidate.id)).toEqual([project.id]);
  });
});
