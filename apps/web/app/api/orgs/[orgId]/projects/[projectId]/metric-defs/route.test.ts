import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
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

async function setupOrgProject(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { ownerSession, organization, project };
}

function metricDefsRequest(
  orgId: string,
  projectId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/metric-defs`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

const adSpendDefinition = {
  definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'reporting_spend', filters: [] } },
  dimensions: ['channel'],
};

describe('GET /api/orgs/[orgId]/projects/[projectId]/metric-defs', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = metricDefsRequest('org-1', 'project-1');
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = metricDefsRequest('does-not-exist-org', 'does-not-exist-project');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });

  it("rejects a member whose role doesn't hold metrics.write (viewer)", async () => {
    const { organization, project } = await setupOrgProject('Metric List Org');
    const viewerEmail = uniqueEmail('metric-list-viewer');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('metric-list-owner-2') });
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: viewerEmail,
      role: 'viewer',
      invitedByUserId: owner.id,
    });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({
      organizationId: organization.id,
      membershipId: invitation.id,
      userId: viewer.id,
      callerEmailVerified: true,
    });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = metricDefsRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(403);
  });

  it('lets an org_owner list metric defs for the project (empty when none registered yet)', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Metric List Owner Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = metricDefsRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ metricDefs: [] });
  });

  it("returns 404 for a project id that doesn't belong to this org, matching POST on the same resource", async () => {
    const { ownerSession, organization } = await setupOrgProject('Metric List Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = metricDefsRequest(organization.id, 'does-not-exist-project');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });
});

describe('POST /api/orgs/[orgId]/projects/[projectId]/metric-defs', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = metricDefsRequest('org-1', 'project-1', { name: 'ad_spend', ...adSpendDefinition });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('rejects a missing name, an invalid definition, and an unknown aggregation function', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Metric Validation Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const missingName = metricDefsRequest(organization.id, project.id, { name: '', ...adSpendDefinition });
    expect((await POST(missingName.request, { params: missingName.params })).status).toBe(400);

    const invalidDefinition = metricDefsRequest(organization.id, project.id, { name: 'x', definition: { kind: 'bogus' }, dimensions: [] });
    expect((await POST(invalidDefinition.request, { params: invalidDefinition.params })).status).toBe(400);

    const badFunction = metricDefsRequest(organization.id, project.id, {
      name: 'x',
      definition: { kind: 'aggregation', aggregation: { function: 'median', table: 'fact_ad_spend', column: 'spend', filters: [] } },
      dimensions: [],
    });
    expect((await POST(badFunction.request, { params: badFunction.params })).status).toBe(400);
  });

  it('registers v1 of a new metric, then lists it', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Metric Register Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = metricDefsRequest(organization.id, project.id, { name: 'ad_spend', ...adSpendDefinition });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { metricDef: { id: string; version: number; status: string } };
    expect(body.metricDef.version).toBe(1);
    expect(body.metricDef.status).toBe('active');

    const listResponse = await GET(metricDefsRequest(organization.id, project.id).request, { params });
    const listed = (await listResponse.json()) as { metricDefs: Array<Record<string, unknown>> };
    expect(listed.metricDefs).toHaveLength(1);
    expect(listed.metricDefs[0]).toMatchObject({ id: body.metricDef.id, name: 'ad_spend', version: 1, definitionKind: 'aggregation' });
  });

  it('rejects registering the same name twice', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Metric Duplicate Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const first = metricDefsRequest(organization.id, project.id, { name: 'ad_spend', ...adSpendDefinition });
    expect((await POST(first.request, { params: first.params })).status).toBe(201);

    const second = metricDefsRequest(organization.id, project.id, { name: 'ad_spend', ...adSpendDefinition });
    const response = await POST(second.request, { params: second.params });
    expect(response.status).toBe(409);
  });
});
