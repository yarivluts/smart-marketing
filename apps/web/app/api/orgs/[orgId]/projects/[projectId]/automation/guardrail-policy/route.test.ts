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

function policyUrl(orgId: string, projectId: string): string {
  return `https://growthos.test/api/orgs/${orgId}/projects/${projectId}/automation/guardrail-policy`;
}

function getRequest(
  orgId: string,
  projectId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(policyUrl(orgId, projectId), { method: 'GET' }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

function postRequest(
  orgId: string,
  projectId: string,
  body: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(policyUrl(orgId, projectId), {
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

const validPolicyBody = {
  maxDailyBudgetChangePct: 30,
  spendCeilingUsd: 500,
  protectedTargetIds: ['campaign-1', 'campaign-2'],
  allowedHoursStartHourUtc: 8,
  allowedHoursEndHourUtc: 18,
  maxActionsPerDay: 10,
  maxGuardedMetricRegressionPct: 15,
};

describe('GET /api/orgs/[orgId]/projects/[projectId]/automation/guardrail-policy', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = getRequest('org-1', 'project-1');
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold automation.execute (viewer)", async () => {
    const { owner, organization, project } = await setupOrgWithProject('Guardrail GET Viewer Org');
    const viewerSession = await setupViewerSession(organization.id, owner.id);

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = getRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 404 for a project id that does not exist in the org', async () => {
    const { ownerSession, organization } = await setupOrgWithProject('Guardrail GET Missing Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = getRequest(organization.id, 'does-not-exist');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('returns the documented defaults when the project has never had an explicit policy set', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Guardrail GET Default Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = getRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      maxDailyBudgetChangePct: 25,
      spendCeilingUsd: null,
      protectedTargetIds: [],
      allowedHours: null,
      maxActionsPerDay: 20,
      maxGuardedMetricRegressionPct: 20,
      setAt: null,
    });
  });

  it('returns the most recently set explicit policy after one has been written', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Guardrail GET Explicit Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const setup = postRequest(organization.id, project.id, JSON.stringify(validPolicyBody));
    const postResponse = await POST(setup.request, { params: setup.params });
    expect(postResponse.status).toBe(201);

    const { request, params } = getRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      maxDailyBudgetChangePct: 30,
      spendCeilingUsd: 500,
      protectedTargetIds: ['campaign-1', 'campaign-2'],
      allowedHours: { startHourUtc: 8, endHourUtc: 18 },
      maxActionsPerDay: 10,
      maxGuardedMetricRegressionPct: 15,
    });
    expect(body.setAt).toEqual(expect.any(String));
  });
});

describe('POST /api/orgs/[orgId]/projects/[projectId]/automation/guardrail-policy', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = postRequest('org-1', 'project-1', JSON.stringify(validPolicyBody));
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold automation.execute (viewer)", async () => {
    const { owner, organization, project } = await setupOrgWithProject('Guardrail POST Viewer Org');
    const viewerSession = await setupViewerSession(organization.id, owner.id);

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = postRequest(organization.id, project.id, JSON.stringify(validPolicyBody));
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 400 invalid_json for a malformed body', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Guardrail POST Bad JSON Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, '{not json');
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_json' });
  });

  it('returns 400 invalid_protected_target_ids when the field is not an array', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Guardrail POST Not Array Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(
      organization.id,
      project.id,
      JSON.stringify({ ...validPolicyBody, protectedTargetIds: 'campaign-1' }),
    );
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_protected_target_ids' });
  });

  it('returns 400 invalid_protected_target_ids when the array holds a non-string element', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Guardrail POST Bad Array Element Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(
      organization.id,
      project.id,
      JSON.stringify({ ...validPolicyBody, protectedTargetIds: ['campaign-1', 42] }),
    );
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_protected_target_ids' });
  });

  it('returns 400 invalid_<field> when a numeric field is the wrong type', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Guardrail POST Bad Field Type Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(
      organization.id,
      project.id,
      JSON.stringify({ ...validPolicyBody, maxDailyBudgetChangePct: 'thirty' }),
    );
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_maxDailyBudgetChangePct' });
  });

  it('returns 400 allowed_hours_must_be_set_together when only the start hour is provided', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Guardrail POST Partial Hours Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(
      organization.id,
      project.id,
      JSON.stringify({ ...validPolicyBody, allowedHoursStartHourUtc: 8, allowedHoursEndHourUtc: null }),
    );
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'allowed_hours_must_be_set_together' });
  });

  it('returns 404 for a project id that does not exist in the org', async () => {
    const { ownerSession, organization } = await setupOrgWithProject('Guardrail POST Missing Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, 'does-not-exist', JSON.stringify(validPolicyBody));
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('returns 400 invalid_policy when a field passes the route type check but fails the service-level range check', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Guardrail POST Negative Value Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(
      organization.id,
      project.id,
      JSON.stringify({ ...validPolicyBody, maxDailyBudgetChangePct: -5 }),
    );
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_policy' });
  });

  it('sets a new policy and returns its id and setAt', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Guardrail POST Success Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = postRequest(organization.id, project.id, JSON.stringify(validPolicyBody));
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; setAt: string };
    expect(body.id).toEqual(expect.any(String));
    expect(body.setAt).toEqual(expect.any(String));
  });
});
