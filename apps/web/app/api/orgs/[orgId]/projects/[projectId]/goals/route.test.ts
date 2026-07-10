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
  registerMetricDefinition,
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

async function setupOrgProject(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { ownerSession, owner, organization, project };
}

async function registerSignups(organizationId: string, projectId: string, createdByUserId: string) {
  return registerMetricDefinition({
    organizationId,
    projectId,
    name: 'signups',
    definition: { kind: 'aggregation', aggregation: { function: 'count', table: 'fact_funnel_event', timeColumn: 'ts', filters: [] } },
    dimensions: [],
    createdByUserId,
  });
}

function goalsRequest(
  orgId: string,
  projectId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/goals`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('GET /api/orgs/[orgId]/projects/[projectId]/goals', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = goalsRequest('org-1', 'project-1');
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = goalsRequest('does-not-exist-org', 'does-not-exist-project');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });

  it("rejects a member whose role doesn't hold dashboards.write (viewer)", async () => {
    const { organization, project } = await setupOrgProject('Goal List Org');
    const viewerEmail = uniqueEmail('goal-list-viewer');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('goal-list-owner-2') });
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = goalsRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(403);
  });

  it('lets an org_owner list goals for the project (empty when none created yet)', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Goal List Owner Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = goalsRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ goals: [] });
  });

  it("returns 404 for a project id that doesn't belong to this org", async () => {
    const { ownerSession, organization } = await setupOrgProject('Goal List Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = goalsRequest(organization.id, 'does-not-exist-project');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });
});

describe('POST /api/orgs/[orgId]/projects/[projectId]/goals', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = goalsRequest('org-1', 'project-1', { name: 'Goal' });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('rejects a malformed request body (400, shape validation)', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Goal Create Shape Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = goalsRequest(organization.id, project.id, { name: '   ' });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
  });

  it('rejects a request whose business rules fail (unregistered metric) with 400 + reasons', async () => {
    const { ownerSession, organization, project, owner } = await setupOrgProject('Goal Create Invalid Org');
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = goalsRequest(organization.id, project.id, {
      name: 'Goal',
      metricName: 'does_not_exist',
      direction: 'maximize',
      targetValue: 100,
      startDate: '2026-01-01',
      deadline: '2026-02-01',
      rhythm: 'even',
      ownerPersonId: person.id,
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; reasons: string[] };
    expect(body.error).toBe('invalid_goal');
    expect(body.reasons.length).toBeGreaterThan(0);
  });

  it('creates a goal, then lists it', async () => {
    const { ownerSession, organization, project, owner } = await setupOrgProject('Goal Create Org');
    await registerSignups(organization.id, project.id, owner.id);
    const person = await createOrgPerson({ organizationId: organization.id, name: 'Rep', createdByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = goalsRequest(organization.id, project.id, {
      name: 'Q3 signups',
      metricName: 'signups',
      direction: 'maximize',
      targetValue: 1000,
      startDate: '2026-07-01',
      deadline: '2026-09-30',
      rhythm: 'even',
      ownerPersonId: person.id,
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { goal: { id: string; name: string } };
    expect(body.goal).toMatchObject({ name: 'Q3 signups' });

    const listResponse = await GET(goalsRequest(organization.id, project.id).request, { params });
    const listed = (await listResponse.json()) as { goals: Array<{ id: string }> };
    expect(listed.goals).toHaveLength(1);
    expect(listed.goals[0].id).toBe(body.goal.id);
  });
});
