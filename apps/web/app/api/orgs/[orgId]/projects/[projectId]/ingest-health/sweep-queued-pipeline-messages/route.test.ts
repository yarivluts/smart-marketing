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
  listQueuedPipelineMessagesForProject,
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
  const prodEnvironment = environments.find((environment) => environment.name === 'prod')!;
  return { ownerSession, owner, organization, project, prodEnvironment };
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

function sweepRequest(orgId: string, projectId: string): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/ingest-health/sweep-queued-pipeline-messages`, {
      method: 'POST',
    }),
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

  it('returns 404 for a caller with no active membership in the org (non-enumeration)', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = sweepRequest('does-not-exist-org', 'does-not-exist-project');
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it("rejects a member whose role doesn't hold ingest.write (viewer)", async () => {
    const { organization } = await setupOrgProject('Sweep Queued Route Viewer Org');
    const viewerEmail = uniqueEmail('sweep-route-viewer');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('sweep-route-owner-2') });
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = sweepRequest(organization.id, 'some-project');
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it("returns 404 for a project id that doesn't belong to this org (KAN-26 non-enumeration)", async () => {
    const { ownerSession, organization } = await setupOrgProject('Sweep Queued Route Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = sweepRequest(organization.id, 'does-not-exist-project');
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('returns a zero-delivered, zero-failed result when nothing is stuck queued', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Sweep Queued Route Empty Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = sweepRequest(organization.id, project.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ delivered: 0, failed: 0 });
  });

  it('lands a message stuck queued (published but never drained) and clears it from the queue', async () => {
    const { ownerSession, organization, project, prodEnvironment } = await setupOrgProject('Sweep Queued Route Clean Org');
    await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      batchId: unique('batch'),
      kind: 'event',
      records: [{ clientId: 'evt-stuck', schemaName: 'order_completed', payload: { net: 1 } }],
    });
    expect(await listQueuedPipelineMessagesForProject(organization.id, project.id)).toHaveLength(1);

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = sweepRequest(organization.id, project.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ delivered: 1, failed: 0 });
    expect(await listQueuedPipelineMessagesForProject(organization.id, project.id)).toHaveLength(0);
  });

  it('KAN-141: lets a project-scoped project_admin sweep queued pipeline messages for THEIR OWN project', async () => {
    const { organization, project, owner } = await setupOrgProject('Sweep Queued Route Project-Scoped Org');
    const memberSession = await inviteProjectScopedMember(organization.id, project.id, 'project_admin', owner.id);

    getServerSessionMock.mockResolvedValue(memberSession);
    const { request, params } = sweepRequest(organization.id, project.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
  });

  it(
    "KAN-141 isolation: a project-scoped project_admin for one project still can't reach a SIBLING " +
      'project in the same org',
    async () => {
      const { organization, project, owner } = await setupOrgProject('Sweep Queued Route Sibling Project Org');
      const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other Project' });
      const memberSession = await inviteProjectScopedMember(organization.id, project.id, 'project_admin', owner.id);

      getServerSessionMock.mockResolvedValue(memberSession);
      const { request, params } = sweepRequest(organization.id, otherProject.id);
      const response = await POST(request, { params });
      expect(response.status).toBe(403);
    },
  );
});
