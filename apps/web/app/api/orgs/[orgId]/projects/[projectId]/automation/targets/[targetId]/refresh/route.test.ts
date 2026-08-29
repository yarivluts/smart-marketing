import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  ensureAutomationTargetSeeded,
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

async function sessionFor(firebaseUid: string, email: string): Promise<DecodedIdToken> {
  await ensureUserForFirebaseSession({ firebaseUid, email });
  return { uid: firebaseUid, email } as DecodedIdToken;
}

function postRequest(
  orgId: string,
  projectId: string,
  targetId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; targetId: string }> } {
  return {
    request: new NextRequest(
      `https://growthos.test/api/orgs/${orgId}/projects/${projectId}/automation/targets/${encodeURIComponent(targetId)}/refresh`,
      { method: 'POST' },
    ),
    params: Promise.resolve({ orgId, projectId, targetId: encodeURIComponent(targetId) }),
  };
}

async function setupOrgWithProject(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), `${unique('owner')}@example.com`);
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { ownerSession, owner, organization, project };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/automation/targets/[targetId]/refresh', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = postRequest('org-1', 'project-1', 'target-1');
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold automation.execute (viewer)", async () => {
    const { owner, organization, project } = await setupOrgWithProject('Refresh Viewer Org');
    const viewerEmail = `${unique('viewer')}@example.com`;
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
    const { request, params } = postRequest(organization.id, project.id, 'target-1');
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 404 not_found for a target that was never seeded', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Refresh Missing Target Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, 'never-seeded');
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('refreshes a simulated target: reports its own state and stamps lastReadStateAt', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Refresh Simulated Org');
    const targetId = unique('campaign');
    await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId,
      targetType: 'campaign',
      label: 'Summer Sale',
      initialDailyBudgetUsd: 40,
      seededByUserId: owner.id,
    });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, targetId);
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string; campaignStatus: string | null; dailyBudgetUsd: number; lastReadStateAt: string | null };
    expect(body.id).toBe(targetId);
    // A freshly seeded simulated target has no campaign yet — the read honestly reports that.
    expect(body.campaignStatus).toBeNull();
    expect(body.dailyBudgetUsd).toBe(40);
    expect(body.lastReadStateAt).toEqual(expect.any(String));
  });
});
