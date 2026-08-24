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
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { GET } from './route';

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
  return { ownerSession, owner, organization, project };
}

function omniSearchRequest(
  orgId: string,
  projectId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/omnisearch`),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('GET /api/orgs/[orgId]/projects/[projectId]/omnisearch', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = omniSearchRequest('org-1', 'project-1');
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = omniSearchRequest('does-not-exist-org', 'does-not-exist-project');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });

  it("returns 404 for a project id that doesn't belong to this org", async () => {
    const { ownerSession, organization } = await setupOrgProject('Omnisearch Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = omniSearchRequest(organization.id, 'does-not-exist-project');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });

  it('returns an empty index for an org_owner when nothing has been created yet', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Omnisearch Empty Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = omniSearchRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [] });
  });

  it('includes a board for an org_owner (full permission -> real wiring end to end)', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgProject('Omnisearch Board Org');
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = omniSearchRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: Array<{ id: string; type: string; label: string; href: string }> };
    expect(body.items).toEqual([
      {
        id: board.id,
        type: 'board',
        label: 'Marketing',
        href: `/orgs/${organization.id}/projects/${project.id}/boards/${board.id}`,
      },
    ]);
  });

  it('returns 200 (not 403) for a viewer, with results limited to the types their role can see', async () => {
    // `viewer` only holds `dashboards.read` (packages/shared/src/policy/roles.ts) — boards are
    // included, but segments/metrics/campaigns (which need write-tier permissions no viewer has)
    // are silently excluded rather than the whole endpoint 403ing. This is the "degrade per result
    // type" behavior the route's own doc comment describes, verified against a role that actually
    // holds one (but not all) of the gating permissions.
    const { owner, organization, project } = await setupOrgProject('Omnisearch Viewer Org');
    const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });

    const viewerEmail = uniqueEmail('omnisearch-viewer');
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = omniSearchRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: Array<{ id: string; type: string }> };
    expect(body.items).toEqual([expect.objectContaining({ id: board.id, type: 'board' })]);
  });
});
