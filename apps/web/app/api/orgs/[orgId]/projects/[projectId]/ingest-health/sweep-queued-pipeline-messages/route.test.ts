import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  enqueueAcceptedRecordsForPipeline,
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
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const prodEnvironment = environments.find((e) => e.name === 'prod')!;
  return { ownerSession, owner, organization, project, prodEnvironment };
}

function sweepRequest(
  orgId: string,
  projectId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(
      `https://growthos.test/api/orgs/${orgId}/projects/${projectId}/ingest-health/sweep-queued-pipeline-messages`,
      { method: 'POST' },
    ),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/ingest-health/sweep-queued-pipeline-messages', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = sweepRequest('org-1', 'project-1');
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = sweepRequest('does-not-exist-org', 'does-not-exist-project');
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it("rejects a member whose role doesn't hold ingest.write (viewer)", async () => {
    const { organization, project } = await setupOrgProject('Sweep Route Viewer Org');
    const viewerEmail = uniqueEmail('sweep-viewer');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('sweep-owner-2') });
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
    const { request, params } = sweepRequest(organization.id, project.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it("returns 404 for a project id that doesn't belong to this org", async () => {
    const { ownerSession, organization } = await setupOrgProject('Sweep Route Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = sweepRequest(organization.id, 'does-not-exist-project');
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it("returns 404 for a project id that belongs to a different org, instead of silently sweeping nothing", async () => {
    const { ownerSession, organization } = await setupOrgProject('Sweep Route Cross-Org Org A');
    const other = await setupOrgProject('Sweep Route Cross-Org Org B');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = sweepRequest(organization.id, other.project.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it('lands every stuck queued message for the project and returns the delivered/failed counts', async () => {
    const { ownerSession, organization, project, prodEnvironment } = await setupOrgProject('Sweep Route Happy Org');
    await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      batchId: unique('batch'),
      kind: 'event',
      records: [{ clientId: 'evt-stuck', schemaName: 'order_completed', payload: { net: 1 } }],
    });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = sweepRequest(organization.id, project.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ delivered: 1, failed: 0 });
  });
});
