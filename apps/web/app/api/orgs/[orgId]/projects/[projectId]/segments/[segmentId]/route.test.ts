import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createOrgPerson,
  createProject,
  createSegment,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  registerSchemaDefinition,
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

async function setupOrgProjectSegment(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  await registerSchemaDefinition({
    organizationId: organization.id,
    projectId: project.id,
    kind: 'entity',
    name: 'customer',
    fields: [
      { name: 'customer_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
      { name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
    ],
    createdByUserId: owner.id,
  });
  const segment = await createSegment({
    organizationId: organization.id,
    projectId: project.id,
    name: 'Pro customers',
    schemaName: 'customer',
    filters: [{ field: 'plan', op: '=', value: 'pro' }],
    createdByUserId: owner.id,
  });
  return { ownerSession, owner, organization, project, segment };
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

function deleteRequest(
  orgId: string,
  projectId: string,
  segmentId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; segmentId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/segments/${segmentId}`, { method: 'DELETE' }),
    params: Promise.resolve({ orgId, projectId, segmentId }),
  };
}

function patchRequest(
  orgId: string,
  projectId: string,
  segmentId: string,
  body: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; segmentId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/segments/${segmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId, segmentId }),
  };
}

describe('DELETE /api/orgs/[orgId]/projects/[projectId]/segments/[segmentId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = deleteRequest('org-1', 'project-1', 'segment-1');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a segment id that does not exist', async () => {
    const { ownerSession, organization, project } = await setupOrgProjectSegment('Segment Delete Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = deleteRequest(organization.id, project.id, 'does-not-exist');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(404);
  });

  it('deletes an existing segment', async () => {
    const { ownerSession, organization, project, segment } = await setupOrgProjectSegment('Segment Delete Happy Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = deleteRequest(organization.id, project.id, segment.id);
    const response = await DELETE(request, { params });
    expect(response.status).toBe(204);

    const second = deleteRequest(organization.id, project.id, segment.id);
    expect((await DELETE(second.request, { params: second.params })).status).toBe(404);
  });

  it("KAN-136 isolation: a project-scoped project_admin for one project can't delete a SIBLING project's segment", async () => {
    const { ownerSession, organization, project, segment } = await setupOrgProjectSegment('Segment Delete Sibling Project Org');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other Project' });
    const memberSession = await inviteProjectScopedMember(organization.id, otherProject.id, 'project_admin', owner.id);

    getServerSessionMock.mockResolvedValue(memberSession);
    const { request, params } = deleteRequest(organization.id, project.id, segment.id);
    const response = await DELETE(request, { params });
    expect(response.status).toBe(403);
  });
});

describe('PATCH /api/orgs/[orgId]/projects/[projectId]/segments/[segmentId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = patchRequest('org-1', 'project-1', 'segment-1', { status: 'done' });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold dashboards.write (viewer)", async () => {
    const { owner, organization, project, segment } = await setupOrgProjectSegment('Segment Patch Viewer Org');
    const viewerEmail = uniqueEmail('segment-patch-viewer');
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewerUser = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewerUser.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = patchRequest(organization.id, project.id, segment.id, { status: 'done' });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 404 for a segment id that does not exist', async () => {
    const { ownerSession, organization, project } = await setupOrgProjectSegment('Segment Patch Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, project.id, 'does-not-exist', { status: 'done' });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(404);
  });

  it('rejects a body with neither ownerPersonId nor status', async () => {
    const { ownerSession, organization, project, segment } = await setupOrgProjectSegment('Segment Patch No Fields Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, project.id, segment.id, {});
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('no_fields_to_update');
  });

  it('rejects an unknown status', async () => {
    const { ownerSession, organization, project, segment } = await setupOrgProjectSegment('Segment Patch Invalid Status Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, project.id, segment.id, { status: 'archived' });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_status');
  });

  it('rejects an owner that does not belong to this organization', async () => {
    const { ownerSession, organization, project, segment } = await setupOrgProjectSegment('Segment Patch Bad Owner Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, project.id, segment.id, { ownerPersonId: 'does-not-exist' });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_segment');
  });

  it('assigns the owner and returns the updated segment', async () => {
    const { ownerSession, owner, organization, project, segment } = await setupOrgProjectSegment('Segment Patch Owner Org');
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = patchRequest(organization.id, project.id, segment.id, { ownerPersonId: person.id });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    expect((await response.json()).segment.ownerPersonId).toBe(person.id);
  });

  it('unassigns the owner with ownerPersonId: null', async () => {
    const { ownerSession, owner, organization, project, segment } = await setupOrgProjectSegment('Segment Patch Unassign Owner Org');
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);
    const assign = patchRequest(organization.id, project.id, segment.id, { ownerPersonId: person.id });
    await PATCH(assign.request, { params: assign.params });

    const { request, params } = patchRequest(organization.id, project.id, segment.id, { ownerPersonId: null });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    expect((await response.json()).segment.ownerPersonId).toBeNull();
  });

  it('ticks the status and returns the updated segment', async () => {
    const { ownerSession, organization, project, segment } = await setupOrgProjectSegment('Segment Patch Status Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = patchRequest(organization.id, project.id, segment.id, { status: 'in_progress' });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    expect((await response.json()).segment.status).toBe('in_progress');
  });

  it('updates owner and status together in one request', async () => {
    const { ownerSession, owner, organization, project, segment } = await setupOrgProjectSegment('Segment Patch Both Org');
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Alex Rep', createdByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = patchRequest(organization.id, project.id, segment.id, { ownerPersonId: person.id, status: 'done' });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()).segment;
    expect(body.ownerPersonId).toBe(person.id);
    expect(body.status).toBe('done');
  });

  it('full-replaces the segment definition (KAN-120) and preserves its id', async () => {
    const { ownerSession, organization, project, segment } = await setupOrgProjectSegment('Segment Patch Definition Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = patchRequest(organization.id, project.id, segment.id, {
      name: 'Pro customers, renamed',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'enterprise' }],
    });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()).segment;
    expect(body.id).toBe(segment.id);
    expect(body.name).toBe('Pro customers, renamed');
    expect(body.filters).toEqual([{ field: 'plan', op: '=', value: 'enterprise' }]);
  });

  it('rejects an invalid definition update with invalid_segment', async () => {
    const { ownerSession, organization, project, segment } = await setupOrgProjectSegment('Segment Patch Definition Invalid Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = patchRequest(organization.id, project.id, segment.id, {
      name: 'X',
      schemaName: 'does_not_exist',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
    });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_segment');
  });

  it('rejects a body mixing definition fields with worklist fields', async () => {
    const { ownerSession, organization, project, segment } = await setupOrgProjectSegment('Segment Patch Mixed Fields Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = patchRequest(organization.id, project.id, segment.id, {
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      status: 'done',
    });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('mixed_update_fields');
  });

  it('returns 404 for a definition update on a segment id that does not exist', async () => {
    const { ownerSession, organization, project } = await setupOrgProjectSegment('Segment Patch Definition Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = patchRequest(organization.id, project.id, 'does-not-exist', {
      name: 'X',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
    });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(404);
  });

  it('KAN-136: lets a project-scoped project_admin update a segment in THEIR OWN project', async () => {
    const { ownerSession, organization, project, segment } = await setupOrgProjectSegment('Segment Patch Project-Scoped Org');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const memberSession = await inviteProjectScopedMember(organization.id, project.id, 'project_admin', owner.id);

    getServerSessionMock.mockResolvedValue(memberSession);
    const { request, params } = patchRequest(organization.id, project.id, segment.id, { status: 'in_progress' });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
  });

  it("KAN-136 isolation: a project-scoped project_admin for one project can't update a SIBLING project's segment", async () => {
    const { ownerSession, organization, project, segment } = await setupOrgProjectSegment('Segment Patch Sibling Project Org');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other Project' });
    const memberSession = await inviteProjectScopedMember(organization.id, otherProject.id, 'project_admin', owner.id);

    getServerSessionMock.mockResolvedValue(memberSession);
    const { request, params } = patchRequest(organization.id, project.id, segment.id, { status: 'in_progress' });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(403);
  });
});
