import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { acceptInvite, createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, inviteMemberToOrganization } from '@growthos/firebase-orm-models';
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
  campaignId: string,
  body: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; campaignId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/campaign-ops/targets/${campaignId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId, campaignId }),
  };
}

function deleteRequest(
  orgId: string,
  projectId: string,
  campaignId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; campaignId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/campaign-ops/targets/${campaignId}`, { method: 'DELETE' }),
    params: Promise.resolve({ orgId, projectId, campaignId }),
  };
}

describe('PATCH /api/orgs/[orgId]/projects/[projectId]/campaign-ops/targets/[campaignId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = patchRequest('org-1', 'project-1', 'summer_search', { monthlyBudget: 100 });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold dashboards.write (viewer)", async () => {
    const { owner, organization, project } = await setupOrgProject('Campaign Target Patch Viewer Org');
    const viewerEmail = uniqueEmail('campaign-target-patch-viewer');
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewerUser = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewerUser.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = patchRequest(organization.id, project.id, 'summer_search', { monthlyBudget: 100 });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(403);
  });

  it('rejects a non-numeric monthlyBudget', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Campaign Target Patch Invalid Body Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, project.id, 'summer_search', { monthlyBudget: 'a lot' });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_body');
  });

  it('rejects a negative monthlyBudget', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Campaign Target Patch Negative Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, project.id, 'summer_search', { monthlyBudget: -5 });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_target');
  });

  it('sets a target and a second PATCH overwrites it', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Campaign Target Patch Happy Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const first = patchRequest(organization.id, project.id, 'summer_search', { monthlyBudget: 500 });
    const firstResponse = await PATCH(first.request, { params: first.params });
    expect(firstResponse.status).toBe(200);
    expect((await firstResponse.json()).monthlyBudget).toBe(500);

    const second = patchRequest(organization.id, project.id, 'summer_search', { monthlyBudget: 750 });
    const secondResponse = await PATCH(second.request, { params: second.params });
    expect(secondResponse.status).toBe(200);
    const body = await secondResponse.json();
    expect(body.monthlyBudget).toBe(750);
    expect(body.campaignId).toBe('summer_search');
  });

  it('returns 404 for a project id that does not belong to the caller\'s org', async () => {
    const { ownerSession, organization } = await setupOrgProject('Campaign Target Patch Org A');
    const { project: otherProject } = await setupOrgProject('Campaign Target Patch Org B');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, otherProject.id, 'summer_search', { monthlyBudget: 100 });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/orgs/[orgId]/projects/[projectId]/campaign-ops/targets/[campaignId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = deleteRequest('org-1', 'project-1', 'summer_search');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(401);
  });

  it('removes a target; deleting a campaign with no target is still a 204', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Campaign Target Delete Happy Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const set = patchRequest(organization.id, project.id, 'brand', { monthlyBudget: 100 });
    await PATCH(set.request, { params: set.params });

    const { request, params } = deleteRequest(organization.id, project.id, 'brand');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(204);

    const second = deleteRequest(organization.id, project.id, 'brand');
    expect((await DELETE(second.request, { params: second.params })).status).toBe(204);
  });
});
