import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { NextRequest } from 'next/server';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
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

async function setupOrgProject(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Original Project', vertical: 'ecommerce' });
  return { owner, ownerSession, organization, project };
}

function patchRequest(orgId: string, projectId: string, body: unknown): NextRequest {
  return new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/orgs/[orgId]/projects/[projectId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await PATCH(patchRequest('org-1', 'project-1', { name: 'x' }), {
      params: Promise.resolve({ orgId: 'org-1', projectId: 'project-1' }),
    });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org (non-enumeration)', async () => {
    getServerSessionMock.mockResolvedValue(await sessionFor(unique('uid'), uniqueEmail('outsider')));
    const response = await PATCH(patchRequest('does-not-exist-org', 'does-not-exist-project', { name: 'x' }), {
      params: Promise.resolve({ orgId: 'does-not-exist-org', projectId: 'does-not-exist-project' }),
    });
    expect(response.status).toBe(404);
  });

  it("rejects a member whose role doesn't hold project.manage (viewer)", async () => {
    const { owner, organization, project } = await setupOrgProject('Project Settings Route Viewer Org');
    const viewerEmail = uniqueEmail('project-settings-route-viewer');
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const response = await PATCH(patchRequest(organization.id, project.id, { name: 'Should not stick' }), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id }),
    });
    expect(response.status).toBe(403);
  });

  it("returns 404 for a project id that doesn't belong to this org (KAN-26 non-enumeration)", async () => {
    const { ownerSession, organization } = await setupOrgProject('Project Settings Route Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const response = await PATCH(patchRequest(organization.id, 'does-not-exist-project', { name: 'x' }), {
      params: Promise.resolve({ orgId: organization.id, projectId: 'does-not-exist-project' }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('returns 400 when name is missing or blank', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Project Settings Route Blank Name Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await PATCH(patchRequest(organization.id, project.id, { name: '   ' }), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'name_required' });
  });

  it('edits the project and returns the updated view', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Project Settings Route Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await PATCH(
      patchRequest(organization.id, project.id, { name: 'Renamed Project', vertical: 'fintech' }),
      { params: Promise.resolve({ orgId: organization.id, projectId: project.id }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { project: { name: string; vertical: string } };
    expect(body.project.name).toBe('Renamed Project');
    expect(body.project.vertical).toBe('fintech');
  });
});
