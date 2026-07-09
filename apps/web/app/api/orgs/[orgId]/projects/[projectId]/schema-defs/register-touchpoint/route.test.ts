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

function registerTouchpointRequest(
  orgId: string,
  projectId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(
      `https://growthos.test/api/orgs/${orgId}/projects/${projectId}/schema-defs/register-touchpoint`,
      { method: 'POST' },
    ),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/schema-defs/register-touchpoint', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = registerTouchpointRequest('org-1', 'project-1');
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a project id that does not belong to this org', async () => {
    const { ownerSession, organization } = await setupOrgProject('Touchpoint Route 404 Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = registerTouchpointRequest(organization.id, 'does-not-exist-project');
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it("rejects a member whose role doesn't hold schema.write (viewer)", async () => {
    const { organization, project } = await setupOrgProject('Touchpoint Route Viewer Org');
    const viewerEmail = uniqueEmail('touchpoint-route-viewer');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('touchpoint-route-owner-2') });
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
    const { request, params } = registerTouchpointRequest(organization.id, project.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('registers v1 of the touchpoint schema, then is a no-op idempotent call the second time', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Touchpoint Route Register Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const first = registerTouchpointRequest(organization.id, project.id);
    const firstResponse = await POST(first.request, { params: first.params });
    expect(firstResponse.status).toBe(200);
    const firstBody = (await firstResponse.json()) as { registered: boolean; schemaDefId: string };
    expect(firstBody.registered).toBe(true);

    const second = registerTouchpointRequest(organization.id, project.id);
    const secondResponse = await POST(second.request, { params: second.params });
    expect(secondResponse.status).toBe(200);
    const secondBody = (await secondResponse.json()) as { registered: boolean; schemaDefId: string };
    expect(secondBody.registered).toBe(false);
    expect(secondBody.schemaDefId).toBe(firstBody.schemaDefId);
  });
});
