import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  listBoardsForProject,
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

function packRequest(
  orgId: string,
  projectId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/onboarding/pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/onboarding/pack', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = packRequest('org-1', 'project-1', { packKey: 'custom' });
    expect((await POST(request, { params })).status).toBe(401);
  });

  it("rejects a member whose role doesn't hold project.manage (viewer)", async () => {
    const { organization, project } = await setupOrgProject('Onboarding Pack Route Viewer Org');
    const viewerEmail = uniqueEmail('onboarding-pack-viewer');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('onboarding-pack-owner-2') });
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = packRequest(organization.id, project.id, { packKey: 'custom' });
    expect((await POST(request, { params })).status).toBe(403);
  });

  it('rejects a missing or unrecognized packKey', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Onboarding Pack Route Validation Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const missing = packRequest(organization.id, project.id, {});
    expect((await POST(missing.request, { params: missing.params })).status).toBe(400);

    const unrecognized = packRequest(organization.id, project.id, { packKey: 'not-a-real-pack' });
    expect((await POST(unrecognized.request, { params: unrecognized.params })).status).toBe(400);
  });

  it('returns 404 for a project id that doesn\'t belong to this org (KAN-26 non-enumeration)', async () => {
    const { ownerSession, organization } = await setupOrgProject('Onboarding Pack Route Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = packRequest(organization.id, 'does-not-exist-project', { packKey: 'custom' });
    expect((await POST(request, { params })).status).toBe(404);
  });

  it('"custom" advances to "sources" without installing anything', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Onboarding Pack Route Custom Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = packRequest(organization.id, project.id, { packKey: 'custom' });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { state: { step: string; selectedPackKey: string | null } };
    expect(body.state.selectedPackKey).toBe('custom');
    expect(body.state.step).toBe('sources');
  });

  it('installing "saas_marketing" provisions the pack\'s starter boards', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Onboarding Pack Route Install Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = packRequest(organization.id, project.id, { packKey: 'saas_marketing' });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { state: { selectedPluginId: string | null } };
    expect(body.state.selectedPluginId).toBe('com.growthos.saas-marketing-metrics');

    const boards = await listBoardsForProject(organization.id, project.id);
    expect(boards.map((board) => board.name).sort()).toEqual(['Funnel', 'Marketing', 'Revenue / MRR']);
  }, 60_000);
});
