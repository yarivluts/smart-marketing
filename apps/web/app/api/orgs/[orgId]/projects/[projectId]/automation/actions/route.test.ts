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
import { GET, POST } from './route';

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

function actionsUrl(orgId: string, projectId: string): string {
  return `https://growthos.test/api/orgs/${orgId}/projects/${projectId}/automation/actions`;
}

function getRequest(
  orgId: string,
  projectId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(actionsUrl(orgId, projectId), { method: 'GET' }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

function postRequest(
  orgId: string,
  projectId: string,
  body: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(actionsUrl(orgId, projectId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

async function setupOrgWithProject(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { ownerSession, owner, organization, project };
}

async function setupViewerSession(organizationId: string, ownerId: string): Promise<DecodedIdToken> {
  const viewerEmail = uniqueEmail('viewer');
  const invitation = await inviteMemberToOrganization({
    organizationId,
    email: viewerEmail,
    role: 'viewer',
    invitedByUserId: ownerId,
  });
  const viewerSession = await sessionFor(unique('uid'), viewerEmail);
  const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
  await acceptInvite({ organizationId, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });
  return viewerSession;
}

async function seedTarget(organizationId: string, projectId: string, seededByUserId: string, initialDailyBudgetUsd = 100) {
  return ensureAutomationTargetSeeded({
    organizationId,
    projectId,
    environmentId: 'live',
    targetId: unique('campaign'),
    targetType: 'campaign',
    label: 'Summer Sale',
    initialDailyBudgetUsd,
    seededByUserId,
  });
}

describe('GET /api/orgs/[orgId]/projects/[projectId]/automation/actions', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = getRequest('org-1', 'project-1');
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold automation.execute (viewer)", async () => {
    const { owner, organization, project } = await setupOrgWithProject('Actions GET Viewer Org');
    const viewerSession = await setupViewerSession(organization.id, owner.id);

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = getRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns an empty actions list for a project id that does not exist in the org (no project-existence check on the read path)', async () => {
    const { ownerSession, organization } = await setupOrgWithProject('Actions GET Missing Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = getRequest(organization.id, 'does-not-exist');
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ actions: [] });
  });

  it('returns the full mapped action shape, newest-proposal-first', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Actions GET Shape Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const firstProposal = postRequest(organization.id, project.id, JSON.stringify({ targetId: target.id, afterDailyBudgetUsd: 110 }));
    const first = await POST(firstProposal.request, { params: firstProposal.params });
    expect(first.status).toBe(201);
    const secondProposal = postRequest(organization.id, project.id, JSON.stringify({ targetId: target.id, afterDailyBudgetUsd: 120 }));
    const second = await POST(secondProposal.request, { params: secondProposal.params });
    expect(second.status).toBe(201);
    const secondBody = (await second.json()) as { id: string };

    const { request, params } = getRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { actions: Array<Record<string, unknown>> };
    expect(body.actions).toHaveLength(2);
    // Newest proposal first: the second POST's action leads the list.
    expect(body.actions[0]?.id).toBe(secondBody.id);
    expect(body.actions[0]).toMatchObject({
      targetId: target.id,
      targetLabel: 'Summer Sale',
      before: { dailyBudgetUsd: 100 },
      after: { dailyBudgetUsd: 120 },
      status: 'awaiting_approval',
      guardrailViolations: [],
    });
    expect(body.actions[0]?.proposedAt).toEqual(expect.any(String));
    // Never-set optional fields (approval/execution/verification/rollback haven't happened yet).
    expect(body.actions[0]?.approvedAt).toBeFalsy();
    expect(body.actions[0]?.executedAt).toBeFalsy();
    expect(body.actions[0]?.failureReason).toBeFalsy();
    expect(body.actions[0]?.verifiedAt).toBeFalsy();
    expect(body.actions[0]?.guardedMetricRegressionPct).toBeFalsy();
    expect(body.actions[0]?.rolledBackAt).toBeFalsy();
    expect(body.actions[0]?.rollbackReason).toBeFalsy();
  });
});

describe('POST /api/orgs/[orgId]/projects/[projectId]/automation/actions', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = postRequest('org-1', 'project-1', JSON.stringify({ targetId: 'x', afterDailyBudgetUsd: 10 }));
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold automation.execute (viewer)", async () => {
    const { owner, organization, project } = await setupOrgWithProject('Actions POST Viewer Org');
    const viewerSession = await setupViewerSession(organization.id, owner.id);

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = postRequest(organization.id, project.id, JSON.stringify({ targetId: 'x', afterDailyBudgetUsd: 10 }));
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 400 invalid_json for a malformed body', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Actions POST Bad JSON Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, '{not json');
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_json' });
  });

  it('returns 400 target_id_required when targetId is missing', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Actions POST Missing Target Field Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, JSON.stringify({ afterDailyBudgetUsd: 10 }));
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'target_id_required' });
  });

  it('returns 400 target_id_required when targetId is an empty/blank string', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Actions POST Blank Target Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, JSON.stringify({ targetId: '   ', afterDailyBudgetUsd: 10 }));
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'target_id_required' });
  });

  it('returns 400 after_daily_budget_usd_required when the field is missing', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Actions POST Missing Budget Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, JSON.stringify({ targetId: 'campaign-1' }));
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'after_daily_budget_usd_required' });
  });

  it('returns 400 after_daily_budget_usd_required when the field is the wrong type', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Actions POST Wrong Type Budget Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, JSON.stringify({ targetId: 'campaign-1', afterDailyBudgetUsd: '120' }));
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'after_daily_budget_usd_required' });
  });

  it('returns 404 not_found for a project id that does not exist in the org', async () => {
    const { ownerSession, organization } = await setupOrgWithProject('Actions POST Missing Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, 'does-not-exist', JSON.stringify({ targetId: 'campaign-1', afterDailyBudgetUsd: 10 }));
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('returns 404 not_found for a target id that does not exist in the project', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Actions POST Missing Target Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, JSON.stringify({ targetId: 'does-not-exist', afterDailyBudgetUsd: 10 }));
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('returns 400 invalid_after_daily_budget_usd for a negative value (passes the route type check, fails the service-level range check)', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Actions POST Negative Budget Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, JSON.stringify({ targetId: target.id, afterDailyBudgetUsd: -5 }));
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_after_daily_budget_usd' });
  });

  it('proposes a clean budget change and lands it awaiting_approval', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Actions POST Clean Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 100);
    getServerSessionMock.mockResolvedValue(ownerSession);

    // 100 -> 120 is a 20% change, under the default 25% guardrail threshold.
    const { request, params } = postRequest(organization.id, project.id, JSON.stringify({ targetId: target.id, afterDailyBudgetUsd: 120 }));
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; status: string; guardrailViolations: unknown[] };
    expect(body.id).toEqual(expect.any(String));
    expect(body.status).toBe('awaiting_approval');
    expect(body.guardrailViolations).toEqual([]);
  });

  it('proposes a budget change that exceeds the guardrail threshold and lands it blocked', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Actions POST Blocked Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 100);
    getServerSessionMock.mockResolvedValue(ownerSession);

    // 100 -> 200 is a 100% change, well past the default 25% guardrail threshold.
    const { request, params } = postRequest(organization.id, project.id, JSON.stringify({ targetId: target.id, afterDailyBudgetUsd: 200 }));
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; status: string; guardrailViolations: unknown[] };
    expect(body.status).toBe('blocked');
    expect(body.guardrailViolations.length).toBeGreaterThan(0);
  });
});
