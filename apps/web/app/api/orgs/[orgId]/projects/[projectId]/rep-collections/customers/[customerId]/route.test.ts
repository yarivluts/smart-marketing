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
import { DELETE, PATCH } from './route';

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

function patchRequest(
  orgId: string,
  projectId: string,
  customerId: string,
  body: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; customerId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/rep-collections/customers/${customerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId, customerId }),
  };
}

function deleteRequest(
  orgId: string,
  projectId: string,
  customerId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; customerId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/rep-collections/customers/${customerId}`, { method: 'DELETE' }),
    params: Promise.resolve({ orgId, projectId, customerId }),
  };
}

describe('PATCH /api/orgs/[orgId]/projects/[projectId]/rep-collections/customers/[customerId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = patchRequest('org-1', 'project-1', 'cus_1', { ownerPersonId: 'person-1' });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold dashboards.write (viewer)", async () => {
    const { owner, organization, project } = await setupOrgProject('Customer Owner Patch Viewer Org');
    const viewerEmail = uniqueEmail('customer-owner-patch-viewer');
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewerUser = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewerUser.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = patchRequest(organization.id, project.id, 'cus_1', { ownerPersonId: 'person-1' });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(403);
  });

  it('rejects a missing ownerPersonId', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Customer Owner Patch Invalid Body Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, project.id, 'cus_1', {});
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_body');
  });

  it('rejects a person id that does not belong to this organization', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Customer Owner Patch Invalid Person Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, project.id, 'cus_1', { ownerPersonId: 'not-a-real-person' });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_owner');
  });

  it('assigns an owner and a second PATCH reassigns it', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgProject('Customer Owner Patch Happy Org');
    const alex = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });
    const sam = await createOrgPerson({ organizationId: organization.id, name: 'Sam Rep', createdByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const first = patchRequest(organization.id, project.id, 'cus_1', { ownerPersonId: alex.id });
    const firstResponse = await PATCH(first.request, { params: first.params });
    expect(firstResponse.status).toBe(200);
    expect((await firstResponse.json()).ownerPersonId).toBe(alex.id);

    const second = patchRequest(organization.id, project.id, 'cus_1', { ownerPersonId: sam.id });
    const secondResponse = await PATCH(second.request, { params: second.params });
    expect(secondResponse.status).toBe(200);
    const body = await secondResponse.json();
    expect(body.ownerPersonId).toBe(sam.id);
    expect(body.customerId).toBe('cus_1');
  });

  it("returns 404 for a project id that does not belong to the caller's org", async () => {
    const { ownerSession, owner, organization } = await setupOrgProject('Customer Owner Patch Org A');
    const { project: otherProject } = await setupOrgProject('Customer Owner Patch Org B');
    const alex = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, otherProject.id, 'cus_1', { ownerPersonId: alex.id });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/orgs/[orgId]/projects/[projectId]/rep-collections/customers/[customerId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = deleteRequest('org-1', 'project-1', 'cus_1');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold dashboards.write (viewer)", async () => {
    const { owner, organization, project } = await setupOrgProject('Customer Owner Delete Viewer Org');
    const viewerEmail = uniqueEmail('customer-owner-delete-viewer');
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewerUser = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewerUser.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = deleteRequest(organization.id, project.id, 'cus_1');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(403);
  });

  it("returns 404 for a project id that does not belong to the caller's org", async () => {
    const { ownerSession, organization } = await setupOrgProject('Customer Owner Delete Org A');
    const { project: otherProject } = await setupOrgProject('Customer Owner Delete Org B');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = deleteRequest(organization.id, otherProject.id, 'cus_1');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(404);
  });

  it('removes an assignment; deleting a customer with no owner is still a 204', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgProject('Customer Owner Delete Happy Org');
    const alex = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const set = patchRequest(organization.id, project.id, 'cus_1', { ownerPersonId: alex.id });
    await PATCH(set.request, { params: set.params });

    const { request, params } = deleteRequest(organization.id, project.id, 'cus_1');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(204);

    const second = deleteRequest(organization.id, project.id, 'cus_1');
    expect((await DELETE(second.request, { params: second.params })).status).toBe(204);
  });
});
