import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { acceptInvite, createOrganizationWithOwner, createOrgPerson, createProject, createRepCollectionEntry, ensureUserForFirebaseSession, inviteMemberToOrganization } from '@growthos/firebase-orm-models';
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

async function setupOrgProjectEntry(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const entry = await createRepCollectionEntry({
    organizationId: organization.id,
    projectId: project.id,
    orgPersonId: null,
    company: 'Acme Inc',
    collectionType: 'upgrade',
    amount: 500,
    occurredAt: '2026-08-24',
    createdByUserId: owner.id,
  });
  return { ownerSession, owner, organization, project, entry };
}

function deleteRequest(
  orgId: string,
  projectId: string,
  entryId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; entryId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/rep-collections/${entryId}`, { method: 'DELETE' }),
    params: Promise.resolve({ orgId, projectId, entryId }),
  };
}

function patchRequest(
  orgId: string,
  projectId: string,
  entryId: string,
  body: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; entryId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/rep-collections/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId, entryId }),
  };
}

describe('DELETE /api/orgs/[orgId]/projects/[projectId]/rep-collections/[entryId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = deleteRequest('org-1', 'project-1', 'entry-1');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold dashboards.write (viewer)", async () => {
    const { owner, organization, project, entry } = await setupOrgProjectEntry('Rep Collection Delete Viewer Org');
    const viewerEmail = uniqueEmail('rep-collection-delete-viewer');
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewerUser = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewerUser.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = deleteRequest(organization.id, project.id, entry.id);
    const response = await DELETE(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 404 for an entry id that does not exist', async () => {
    const { ownerSession, organization, project } = await setupOrgProjectEntry('Rep Collection Delete Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = deleteRequest(organization.id, project.id, 'does-not-exist');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(404);
  });

  it('deletes an existing entry', async () => {
    const { ownerSession, organization, project, entry } = await setupOrgProjectEntry('Rep Collection Delete Happy Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = deleteRequest(organization.id, project.id, entry.id);
    const response = await DELETE(request, { params });
    expect(response.status).toBe(204);

    const second = deleteRequest(organization.id, project.id, entry.id);
    expect((await DELETE(second.request, { params: second.params })).status).toBe(404);
  });
});

describe('PATCH /api/orgs/[orgId]/projects/[projectId]/rep-collections/[entryId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = patchRequest('org-1', 'project-1', 'entry-1', { amount: 100 });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold dashboards.write (viewer)", async () => {
    const { owner, organization, project, entry } = await setupOrgProjectEntry('Rep Collection Patch Viewer Org');
    const viewerEmail = uniqueEmail('rep-collection-patch-viewer');
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewerUser = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewerUser.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = patchRequest(organization.id, project.id, entry.id, { amount: 100 });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 404 for an entry id that does not exist', async () => {
    const { ownerSession, organization, project } = await setupOrgProjectEntry('Rep Collection Patch Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, project.id, 'does-not-exist', { amount: 100 });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(404);
  });

  it('rejects a body with neither orgPersonId nor amount', async () => {
    const { ownerSession, organization, project, entry } = await setupOrgProjectEntry('Rep Collection Patch No Fields Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, project.id, entry.id, {});
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('no_fields_to_update');
  });

  it('rejects a non-positive amount', async () => {
    const { ownerSession, organization, project, entry } = await setupOrgProjectEntry('Rep Collection Patch Invalid Amount Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, project.id, entry.id, { amount: 0 });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_entry');
  });

  it('rejects an orgPersonId that does not belong to this organization', async () => {
    const { ownerSession, organization, project, entry } = await setupOrgProjectEntry('Rep Collection Patch Bad Rep Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, project.id, entry.id, { orgPersonId: 'does-not-exist' });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_entry');
  });

  it('reassigns the rep and returns the updated entry', async () => {
    const { ownerSession, owner, organization, project, entry } = await setupOrgProjectEntry('Rep Collection Patch Rep Org');
    const rep = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = patchRequest(organization.id, project.id, entry.id, { orgPersonId: rep.id });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    expect((await response.json()).entry.orgPersonId).toBe(rep.id);
  });

  it('unassigns the rep with orgPersonId: null', async () => {
    const { ownerSession, owner, organization, project, entry } = await setupOrgProjectEntry('Rep Collection Patch Unassign Org');
    const rep = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);
    const assign = patchRequest(organization.id, project.id, entry.id, { orgPersonId: rep.id });
    await PATCH(assign.request, { params: assign.params });

    const { request, params } = patchRequest(organization.id, project.id, entry.id, { orgPersonId: null });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    expect((await response.json()).entry.orgPersonId).toBeNull();
  });

  it('corrects the amount and returns the updated entry', async () => {
    const { ownerSession, organization, project, entry } = await setupOrgProjectEntry('Rep Collection Patch Amount Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = patchRequest(organization.id, project.id, entry.id, { amount: 650 });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    expect((await response.json()).entry.amount).toBe(650);
  });

  it('updates rep and amount together in one request', async () => {
    const { ownerSession, owner, organization, project, entry } = await setupOrgProjectEntry('Rep Collection Patch Both Org');
    const rep = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = patchRequest(organization.id, project.id, entry.id, { orgPersonId: rep.id, amount: 700 });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()).entry;
    expect(body.orgPersonId).toBe(rep.id);
    expect(body.amount).toBe(700);
  });
});
