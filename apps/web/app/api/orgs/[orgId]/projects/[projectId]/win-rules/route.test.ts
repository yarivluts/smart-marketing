import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  registerSchemaDefinition,
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

async function registerOrderCompleted(organizationId: string, projectId: string, createdByUserId: string) {
  return registerSchemaDefinition({
    organizationId,
    projectId,
    kind: 'event',
    name: 'order_completed',
    fields: [{ name: 'amount', type: 'number', isRequired: false, isPii: false, isIdentityKey: false }],
    createdByUserId,
  });
}

function winRulesRequest(
  orgId: string,
  projectId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/win-rules`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('GET /api/orgs/[orgId]/projects/[projectId]/win-rules', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = winRulesRequest('org-1', 'project-1');
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = winRulesRequest('does-not-exist-org', 'does-not-exist-project');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });

  it("rejects a member whose role doesn't hold dashboards.write (viewer)", async () => {
    const { organization, project, owner } = await setupOrgProject('Win Rule List Org');
    const viewerEmail = uniqueEmail('win-rule-list-viewer');
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = winRulesRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(403);
  });

  it('lets an org_owner list win rules for the project (empty when none created yet)', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Win Rule List Owner Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = winRulesRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ winRules: [] });
  });
});

describe('POST /api/orgs/[orgId]/projects/[projectId]/win-rules', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = winRulesRequest('org-1', 'project-1', { name: 'Big order' });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('rejects a malformed request body (400, shape validation)', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Win Rule Create Shape Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = winRulesRequest(organization.id, project.id, { name: '   ' });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
  });

  it('rejects a request whose business rules fail (unregistered schema) with 400 + reasons', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Win Rule Create Invalid Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = winRulesRequest(organization.id, project.id, {
      name: 'Ghost win',
      schemaName: 'does_not_exist',
      filters: [],
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; reasons: string[] };
    expect(body.error).toBe('invalid_win_rule');
    expect(body.reasons.length).toBeGreaterThan(0);
  });

  it('creates a win rule, then lists it', async () => {
    const { ownerSession, organization, project, owner } = await setupOrgProject('Win Rule Create Org');
    await registerOrderCompleted(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = winRulesRequest(organization.id, project.id, {
      name: 'Big order',
      schemaName: 'order_completed',
      filters: [{ field: 'properties.amount', operator: '>', value: '100' }],
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { winRule: { id: string; name: string; active: boolean; winType: string } };
    expect(body.winRule).toMatchObject({ name: 'Big order', active: true, winType: 'generic' });

    const listResponse = await GET(winRulesRequest(organization.id, project.id).request, { params });
    const listed = (await listResponse.json()) as { winRules: Array<{ id: string }> };
    expect(listed.winRules).toHaveLength(1);
    expect(listed.winRules[0].id).toBe(body.winRule.id);
  });

  it('creates a win rule tagged with a KAN-66 win-catalog type', async () => {
    const { ownerSession, organization, project, owner } = await setupOrgProject('Win Rule Create Typed Org');
    await registerOrderCompleted(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = winRulesRequest(organization.id, project.id, {
      name: 'Reactivated customer',
      schemaName: 'order_completed',
      filters: [],
      winType: 'reactivation',
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { winRule: { winType: string } };
    expect(body.winRule.winType).toBe('reactivation');
  });

  it('rejects an unknown win type (400, shape validation)', async () => {
    const { ownerSession, organization, project, owner } = await setupOrgProject('Win Rule Create Bad Type Org');
    await registerOrderCompleted(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = winRulesRequest(organization.id, project.id, {
      name: 'Big order',
      schemaName: 'order_completed',
      filters: [],
      winType: 'churn',
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toEqual({ error: 'invalid_win_type' });
  });
});
