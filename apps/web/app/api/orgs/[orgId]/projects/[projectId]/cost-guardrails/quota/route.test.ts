import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { acceptInvite, createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, inviteMemberToOrganization } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { getProjectCostQuota } from '@/lib/orgs/queries';
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

function quotaRequest(orgId: string, projectId: string, body?: unknown): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/cost-guardrails/quota`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/cost-guardrails/quota', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = quotaRequest('org-1', 'project-1', { dailyQueryLimit: 10, labels: {} });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org (non-enumeration)', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = quotaRequest('does-not-exist-org', 'does-not-exist-project', { dailyQueryLimit: 10, labels: {} });
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it("rejects a member whose role doesn't hold project.manage (viewer)", async () => {
    const { organization, project } = await setupOrgProject('Quota Route Viewer Org');
    const viewerEmail = uniqueEmail('quota-route-viewer');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('quota-route-owner-2') });
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = quotaRequest(organization.id, project.id, { dailyQueryLimit: 10, labels: {} });
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it("returns 404 for a project id that doesn't belong to this org (KAN-26 non-enumeration)", async () => {
    const { ownerSession, organization } = await setupOrgProject('Quota Route Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = quotaRequest(organization.id, 'does-not-exist-project', { dailyQueryLimit: 10, labels: {} });
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it('rejects a missing/invalid dailyQueryLimit and invalid labels', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Quota Route Validation Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const missingLimit = quotaRequest(organization.id, project.id, { labels: {} });
    expect((await POST(missingLimit.request, { params: missingLimit.params })).status).toBe(400);

    const nonNumericLimit = quotaRequest(organization.id, project.id, { dailyQueryLimit: 'ten', labels: {} });
    expect((await POST(nonNumericLimit.request, { params: nonNumericLimit.params })).status).toBe(400);

    const invalidLabels = quotaRequest(organization.id, project.id, { dailyQueryLimit: 10, labels: { team: 5 } });
    expect((await POST(invalidLabels.request, { params: invalidLabels.params })).status).toBe(400);

    const nonPositiveLimit = quotaRequest(organization.id, project.id, { dailyQueryLimit: 0, labels: {} });
    expect((await POST(nonPositiveLimit.request, { params: nonPositiveLimit.params })).status).toBe(400);
  });

  it('sets the quota and is readable back via getProjectCostQuota', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Quota Route Set Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = quotaRequest(organization.id, project.id, { dailyQueryLimit: 25, labels: { team: 'growth' } });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { dailyQueryLimit: number; labels: Record<string, string> };
    expect(body.dailyQueryLimit).toBe(25);
    expect(body.labels).toEqual({ team: 'growth' });

    const quota = await getProjectCostQuota(organization.id, project.id);
    expect(quota.dailyQueryLimit).toBe(25);
  });
});
