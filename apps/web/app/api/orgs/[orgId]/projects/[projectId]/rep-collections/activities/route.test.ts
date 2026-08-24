import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createOrgPerson,
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
  return { ownerSession, owner, organization, project };
}

function postRequest(orgId: string, projectId: string, body: unknown): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/rep-collections/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/rep-collections/activities', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = postRequest('org-1', 'project-1', { customerId: 'cus_1', personId: 'person-1', activityType: 'call' });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold dashboards.write (viewer)", async () => {
    const { owner, organization, project } = await setupOrgProject('Collection Activity Post Viewer Org');
    const viewerEmail = uniqueEmail('collection-activity-post-viewer');
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewerUser = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewerUser.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = postRequest(organization.id, project.id, { customerId: 'cus_1', personId: 'person-1', activityType: 'call' });
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('rejects an unknown activityType', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgProject('Collection Activity Post Invalid Type Org');
    const alex = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = postRequest(organization.id, project.id, { customerId: 'cus_1', personId: alex.id, activityType: 'not_a_real_type' });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_body');
  });

  it('rejects a person id that does not belong to this organization', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Collection Activity Post Invalid Person Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = postRequest(organization.id, project.id, { customerId: 'cus_1', personId: 'not-a-real-person', activityType: 'call' });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_activity');
  });

  it('records an activity with an optional note', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgProject('Collection Activity Post Happy Org');
    const alex = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, {
      customerId: 'cus_1',
      personId: alex.id,
      activityType: 'payment_followup',
      note: 'Sent a reminder email',
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.customerId).toBe('cus_1');
    expect(body.activityType).toBe('payment_followup');
  });

  it("returns 404 for a project id that does not belong to the caller's org", async () => {
    const { ownerSession, owner, organization } = await setupOrgProject('Collection Activity Post Org A');
    const { project: otherProject } = await setupOrgProject('Collection Activity Post Org B');
    const alex = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = postRequest(organization.id, otherProject.id, { customerId: 'cus_1', personId: alex.id, activityType: 'call' });
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });
});
