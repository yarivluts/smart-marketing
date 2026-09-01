import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createGoal,
  createOrganizationWithOwner,
  createOrgPerson,
  createProject,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  registerMetricDefinition,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { DELETE, GET, PATCH } from './route';

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

async function setupOrgProjectGoal(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  await registerMetricDefinition({
    organizationId: organization.id,
    projectId: project.id,
    name: 'signups',
    // A "signups"-named metric against an unrelated real table — this fixture exercises the
    // "no warehouse configured" degrade, independent of whichever table the SaaS pack's actual
    // `signups` metric targets.
    definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'fact_landing_page_performance', timeColumn: 'date', filters: [] } },
    dimensions: [],
    createdByUserId: owner.id,
  });
  const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
  const goal = await createGoal({
    organizationId: organization.id,
    projectId: project.id,
    name: 'Q3 signups',
    metricName: 'signups',
    direction: 'maximize',
    targetValue: 1000,
    startDate: '2026-07-01',
    deadline: '2026-09-30',
    rhythm: 'even',
    ownerPersonId: person.id,
    createdByUserId: owner.id,
  });
  return { ownerSession, owner, organization, project, goal };
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

function getRequest(
  orgId: string,
  projectId: string,
  goalId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; goalId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/goals/${goalId}`, { method: 'GET' }),
    params: Promise.resolve({ orgId, projectId, goalId }),
  };
}

function deleteRequest(
  orgId: string,
  projectId: string,
  goalId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; goalId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/goals/${goalId}`, { method: 'DELETE' }),
    params: Promise.resolve({ orgId, projectId, goalId }),
  };
}

function patchRequest(
  orgId: string,
  projectId: string,
  goalId: string,
  body: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; goalId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/goals/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId, goalId }),
  };
}

describe('GET /api/orgs/[orgId]/projects/[projectId]/goals/[goalId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = getRequest('org-1', 'project-1', 'goal-1');
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a goal id that does not exist', async () => {
    const { ownerSession, organization, project } = await setupOrgProjectGoal('Goal Get Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = getRequest(organization.id, project.id, 'does-not-exist');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });

  it('returns the goal plus a degraded thermometer outcome (warehouse not configured)', async () => {
    const { ownerSession, organization, project, goal } = await setupOrgProjectGoal('Goal Get Happy Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = getRequest(organization.id, project.id, goal.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { goal: { name: string; targetValue: number | null }; thermometer: { kind: string } };
    expect(body.goal).toMatchObject({ name: 'Q3 signups', targetValue: 1000 });
    expect(body.thermometer.kind).toBe('warehouse_not_configured');
  });

  it('KAN-136: lets a project-scoped project_admin read a goal in THEIR OWN project', async () => {
    const { organization, project, goal, owner } = await setupOrgProjectGoal('Goal Get Project-Scoped Org');
    const memberSession = await inviteProjectScopedMember(organization.id, project.id, 'project_admin', owner.id);

    getServerSessionMock.mockResolvedValue(memberSession);
    const { request, params } = getRequest(organization.id, project.id, goal.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
  });

  it(
    "KAN-136 isolation: a project-scoped project_admin for one project can't read a goal in a SIBLING " +
      'project in the same org',
    async () => {
      const { organization, project, goal, owner } = await setupOrgProjectGoal('Goal Get Sibling Project Org');
      const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other Project' });
      const memberSession = await inviteProjectScopedMember(organization.id, otherProject.id, 'project_admin', owner.id);

      getServerSessionMock.mockResolvedValue(memberSession);
      const { request, params } = getRequest(organization.id, project.id, goal.id);
      const response = await GET(request, { params });
      expect(response.status).toBe(403);
    },
  );
});

describe('DELETE /api/orgs/[orgId]/projects/[projectId]/goals/[goalId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = deleteRequest('org-1', 'project-1', 'goal-1');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a goal id that does not exist', async () => {
    const { ownerSession, organization, project } = await setupOrgProjectGoal('Goal Delete Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = deleteRequest(organization.id, project.id, 'does-not-exist');
    const response = await DELETE(request, { params });
    expect(response.status).toBe(404);
  });

  it('deletes an existing goal', async () => {
    const { ownerSession, organization, project, goal } = await setupOrgProjectGoal('Goal Delete Happy Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = deleteRequest(organization.id, project.id, goal.id);
    const response = await DELETE(request, { params });
    expect(response.status).toBe(204);

    const second = deleteRequest(organization.id, project.id, goal.id);
    expect((await DELETE(second.request, { params: second.params })).status).toBe(404);
  });

  it('KAN-136: lets a project-scoped project_admin delete a goal in THEIR OWN project', async () => {
    const { organization, project, goal, owner } = await setupOrgProjectGoal('Goal Delete Project-Scoped Org');
    const memberSession = await inviteProjectScopedMember(organization.id, project.id, 'project_admin', owner.id);

    getServerSessionMock.mockResolvedValue(memberSession);
    const { request, params } = deleteRequest(organization.id, project.id, goal.id);
    const response = await DELETE(request, { params });
    expect(response.status).toBe(204);
  });
});

describe('PATCH /api/orgs/[orgId]/projects/[projectId]/goals/[goalId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = patchRequest('org-1', 'project-1', 'goal-1', { targetValue: 100 });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a goal id that does not exist', async () => {
    const { ownerSession, organization, project } = await setupOrgProjectGoal('Goal Patch Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, project.id, 'does-not-exist', { targetValue: 100 });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(404);
  });

  it('rejects a malformed body (no fields to update)', async () => {
    const { ownerSession, organization, project, goal } = await setupOrgProjectGoal('Goal Patch Empty Body Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, project.id, goal.id, {});
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
  });

  it('rejects an invalid update (targetValue on a range goal) with the service’s reasons', async () => {
    const { ownerSession, organization, project, goal } = await setupOrgProjectGoal('Goal Patch Invalid Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    // `goal` is a maximize goal (see setupOrgProjectGoal) — sending rangeMin/rangeMax is the mismatch here.
    const { request, params } = patchRequest(organization.id, project.id, goal.id, { rangeMin: 10, rangeMax: 20 });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; reasons: string[] };
    expect(body.error).toBe('invalid_goal');
    expect(body.reasons.length).toBeGreaterThan(0);
  });

  it('updates the target value and returns the updated goal summary', async () => {
    const { ownerSession, organization, project, goal } = await setupOrgProjectGoal('Goal Patch Happy Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, project.id, goal.id, { targetValue: 1500 });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { goal: { targetValue: number | null } };
    expect(body.goal.targetValue).toBe(1500);

    const getResult = await GET(getRequest(organization.id, project.id, goal.id).request, { params: getRequest(organization.id, project.id, goal.id).params });
    const getBody = (await getResult.json()) as { goal: { targetValue: number | null } };
    expect(getBody.goal.targetValue).toBe(1500);
  });

  it('returns 404 for a definition update against a goal id that does not exist', async () => {
    const { ownerSession, organization, project } = await setupOrgProjectGoal('Goal Patch Definition Missing Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, project.id, 'does-not-exist', {
      name: 'Q3 signups',
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 1000,
      startDate: '2026-07-01',
      deadline: '2026-09-30',
      rhythm: 'even',
      ownerPersonId: 'does-not-matter',
    });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(404);
  });

  it('rejects a definition update naming an unregistered metric, with the service’s reasons', async () => {
    const { ownerSession, organization, project, goal } = await setupOrgProjectGoal('Goal Patch Definition Invalid Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = patchRequest(organization.id, project.id, goal.id, {
      name: 'Q3 signups',
      metricName: 'does-not-exist',
      direction: 'maximize',
      targetValue: 1000,
      startDate: '2026-07-01',
      deadline: '2026-09-30',
      rhythm: 'even',
      ownerPersonId: 'does-not-exist',
    });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; reasons: string[] };
    expect(body.error).toBe('invalid_goal');
    expect(body.reasons.length).toBeGreaterThan(0);
  });

  it('replaces the full definition (name/metric/direction/dates/rhythm/owner) and returns the updated summary', async () => {
    const { ownerSession, organization, project, goal, owner } = await setupOrgProjectGoal('Goal Patch Definition Happy Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const newPerson = await createOrgPerson({ organizationId: organization.id, name: 'New Owner', createdByUserId: owner.id });

    const { request, params } = patchRequest(organization.id, project.id, goal.id, {
      name: 'Q3 signups (revised)',
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 1200,
      startDate: '2026-07-15',
      deadline: '2026-10-15',
      rhythm: 'work_week_weekend',
      ownerPersonId: newPerson.id,
    });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { goal: { name: string; targetValue: number | null; ownerPersonId: string } };
    expect(body.goal.name).toBe('Q3 signups (revised)');
    expect(body.goal.targetValue).toBe(1200);
    expect(body.goal.ownerPersonId).toBe(newPerson.id);

    const getResult = await GET(getRequest(organization.id, project.id, goal.id).request, { params: getRequest(organization.id, project.id, goal.id).params });
    const getBody = (await getResult.json()) as { goal: { name: string; startDate: string; rhythm: string } };
    expect(getBody.goal).toMatchObject({ name: 'Q3 signups (revised)', startDate: '2026-07-15', rhythm: 'work_week_weekend' });
  });

  it('KAN-136: lets a project-scoped editor update the target value in THEIR OWN project', async () => {
    const { organization, project, goal, owner } = await setupOrgProjectGoal('Goal Patch Project-Scoped Org');
    const memberSession = await inviteProjectScopedMember(organization.id, project.id, 'editor', owner.id);

    getServerSessionMock.mockResolvedValue(memberSession);
    const { request, params } = patchRequest(organization.id, project.id, goal.id, { targetValue: 1500 });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(200);
  });
});
