import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getActiveMetricDefinition,
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

function postRequest(orgId: string, projectId: string, body: string) {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/metric-defs/archive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

async function setupOrgWithMetrics(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), `${unique('owner')}@example.com`);
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  await registerMetricDefinition({
    organizationId: organization.id,
    projectId: project.id,
    name: 'ad_spend',
    definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_attribution', column: 'credit', timeColumn: 'occurred_at', filters: [] } },
    dimensions: [],
    createdByUserId: owner.id,
  });
  await registerMetricDefinition({
    organizationId: organization.id,
    projectId: project.id,
    name: 'signups',
    definition: { kind: 'aggregation', aggregation: { function: 'count_distinct', table: 'fact_funnel_event', column: 'customer_id', timeColumn: 'ts', filters: [] } },
    dimensions: [],
    createdByUserId: owner.id,
  });
  await registerMetricDefinition({
    organizationId: organization.id,
    projectId: project.id,
    name: 'cost_per_signup',
    definition: { kind: 'formula', formula: 'ad_spend / signups' },
    dimensions: [],
    createdByUserId: owner.id,
  });
  return { ownerSession, owner, organization, project };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/metric-defs/archive', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = postRequest('org-1', 'project-1', JSON.stringify({ name: 'ad_spend' }));
    expect((await POST(request, { params })).status).toBe(401);
  });

  it("rejects a member whose role doesn't hold metrics.write (viewer)", async () => {
    const { owner, organization, project } = await setupOrgWithMetrics('Archive Metric Viewer Org');
    const viewerEmail = `${unique('viewer')}@example.com`;
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = postRequest(organization.id, project.id, JSON.stringify({ name: 'ad_spend' }));
    expect((await POST(request, { params })).status).toBe(403);
  });

  it('returns 400 name_required without a name, and 404 for an unknown family', async () => {
    const { ownerSession, organization, project } = await setupOrgWithMetrics('Archive Metric Bad Input Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const missing = postRequest(organization.id, project.id, JSON.stringify({}));
    expect((await POST(missing.request, { params: missing.params })).status).toBe(400);

    const unknown = postRequest(organization.id, project.id, JSON.stringify({ name: 'never_registered' }));
    expect((await POST(unknown.request, { params: unknown.params })).status).toBe(404);
  });

  it('returns 409 still_referenced naming the formulas, then archives once they are gone', async () => {
    const { ownerSession, organization, project } = await setupOrgWithMetrics('Archive Metric Flow Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const blocked = postRequest(organization.id, project.id, JSON.stringify({ name: 'ad_spend' }));
    const blockedResponse = await POST(blocked.request, { params: blocked.params });
    expect(blockedResponse.status).toBe(409);
    expect(await blockedResponse.json()).toEqual({ error: 'still_referenced', referencedBy: ['cost_per_signup'] });

    const formula = postRequest(organization.id, project.id, JSON.stringify({ name: 'cost_per_signup' }));
    expect((await POST(formula.request, { params: formula.params })).status).toBe(200);

    const archive = postRequest(organization.id, project.id, JSON.stringify({ name: 'ad_spend' }));
    const archiveResponse = await POST(archive.request, { params: archive.params });
    expect(archiveResponse.status).toBe(200);
    expect(((await archiveResponse.json()) as { metricDef: { status: string } }).metricDef.status).toBe('archived');
    expect(await getActiveMetricDefinition(organization.id, project.id, 'ad_spend')).toBeNull();
  });
});
