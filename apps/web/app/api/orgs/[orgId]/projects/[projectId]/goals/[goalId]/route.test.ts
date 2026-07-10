import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  createGoal,
  createOrganizationWithOwner,
  createOrgPerson,
  createProject,
  ensureUserForFirebaseSession,
  registerMetricDefinition,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { DELETE, GET } from './route';

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
    definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'fact_funnel_event', timeColumn: 'ts', filters: [] } },
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
});
