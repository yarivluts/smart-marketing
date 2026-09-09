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
  getGoal,
  inviteMemberToOrganization,
  registerMetricDefinition,
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

function postRequest(orgId: string, projectId: string, goalId: string, body: string) {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/goals/${goalId}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    params: Promise.resolve({ orgId, projectId, goalId }),
  };
}

async function setupOrgProjectGoal(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), `${unique('owner')}@example.com`);
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  await registerMetricDefinition({
    organizationId: organization.id,
    projectId: project.id,
    name: 'lp_conversions',
    definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_landing_page_performance', column: 'conversions', timeColumn: 'activity_date', filters: [] } },
    dimensions: [],
    createdByUserId: owner.id,
  });
  const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
  const goal = await createGoal({
    organizationId: organization.id,
    projectId: project.id,
    name: 'Lift landing page conversion',
    metricName: 'lp_conversions',
    direction: 'maximize',
    targetValue: 8,
    startDate: '2026-08-17',
    deadline: '2026-09-30',
    rhythm: 'even',
    ownerPersonId: person.id,
    createdByUserId: owner.id,
  });
  return { ownerSession, owner, organization, project, goal };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/goals/[goalId]/status', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = postRequest('org-1', 'project-1', 'goal-1', JSON.stringify({ status: 'paused' }));
    expect((await POST(request, { params })).status).toBe(401);
  });

  it("rejects a member whose role doesn't hold dashboards.write (viewer)", async () => {
    const { owner, organization, project, goal } = await setupOrgProjectGoal('Goal Status Viewer Org');
    const viewerEmail = `${unique('viewer')}@example.com`;
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = postRequest(organization.id, project.id, goal.id, JSON.stringify({ status: 'paused' }));
    expect((await POST(request, { params })).status).toBe(403);
  });

  it('returns 400 invalid_status for an unknown status, and 404 for an unknown goal', async () => {
    const { ownerSession, organization, project, goal } = await setupOrgProjectGoal('Goal Status Bad Input Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const bad = postRequest(organization.id, project.id, goal.id, JSON.stringify({ status: 'archived' }));
    const badResponse = await POST(bad.request, { params: bad.params });
    expect(badResponse.status).toBe(400);
    expect(await badResponse.json()).toEqual({ error: 'invalid_status' });

    const missing = postRequest(organization.id, project.id, 'does-not-exist', JSON.stringify({ status: 'paused' }));
    expect((await POST(missing.request, { params: missing.params })).status).toBe(404);
  });

  it('pauses then resumes the goal', async () => {
    const { ownerSession, organization, project, goal } = await setupOrgProjectGoal('Goal Status Flow Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const pause = postRequest(organization.id, project.id, goal.id, JSON.stringify({ status: 'paused' }));
    const pauseResponse = await POST(pause.request, { params: pause.params });
    expect(pauseResponse.status).toBe(200);
    expect(((await pauseResponse.json()) as { goal: { status: string } }).goal.status).toBe('paused');
    expect((await getGoal(organization.id, project.id, goal.id))?.status).toBe('paused');

    const resume = postRequest(organization.id, project.id, goal.id, JSON.stringify({ status: 'active' }));
    const resumeResponse = await POST(resume.request, { params: resume.params });
    expect(((await resumeResponse.json()) as { goal: { status: string } }).goal.status).toBe('active');
  });
});
