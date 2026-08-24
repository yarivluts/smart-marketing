import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { acceptInvite, createOrganizationWithOwner, createOrgPerson, createProject, ensureUserForFirebaseSession, inviteMemberToOrganization } from '@growthos/firebase-orm-models';
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

function repCollectionsRequest(
  orgId: string,
  projectId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/rep-collections`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('GET /api/orgs/[orgId]/projects/[projectId]/rep-collections', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = repCollectionsRequest('org-1', 'project-1');
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = repCollectionsRequest('does-not-exist-org', 'does-not-exist-project');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });

  it("rejects a member whose role doesn't hold dashboards.write (viewer)", async () => {
    const { organization, project } = await setupOrgProject('Rep Collections List Org');
    const viewerEmail = uniqueEmail('rep-collections-viewer');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('rep-collections-owner-2') });
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = repCollectionsRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(403);
  });

  it('lets an org_owner list the ledger for the project (empty when none logged yet)', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Rep Collections List Owner Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = repCollectionsRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entries: [] });
  });

  it("returns 404 for a project id that doesn't belong to this org", async () => {
    const { ownerSession, organization } = await setupOrgProject('Rep Collections Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = repCollectionsRequest(organization.id, 'does-not-exist-project');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });
});

describe('POST /api/orgs/[orgId]/projects/[projectId]/rep-collections', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = repCollectionsRequest('org-1', 'project-1', { company: 'Acme' });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('rejects a malformed request body (400, shape validation)', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Rep Collections Create Shape Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = repCollectionsRequest(organization.id, project.id, { company: '   ' });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
  });

  it('rejects a request whose business rules fail (unknown collection type) with 400 + reasons', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Rep Collections Create Invalid Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = repCollectionsRequest(organization.id, project.id, {
      company: 'Acme',
      collectionType: 'not_a_real_type',
      amount: 100,
      occurredAt: '2026-08-24',
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; reasons: string[] };
    expect(body.error).toBe('invalid_entry');
    expect(body.reasons.length).toBeGreaterThan(0);
  });

  it('creates an unattributed entry, then lists it', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Rep Collections Create Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = repCollectionsRequest(organization.id, project.id, {
      company: 'Acme Inc',
      collectionType: 'upgrade',
      amount: 500,
      occurredAt: '2026-08-24',
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { entry: { id: string; company: string; orgPersonId: string | null } };
    expect(body.entry).toMatchObject({ company: 'Acme Inc', orgPersonId: null });

    const listResponse = await GET(repCollectionsRequest(organization.id, project.id).request, { params });
    const listed = (await listResponse.json()) as { entries: Array<{ id: string }> };
    expect(listed.entries).toHaveLength(1);
    expect(listed.entries[0].id).toBe(body.entry.id);
  });

  it('creates an entry attributed to a rep', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgProject('Rep Collections Create Attributed Org');
    const rep = await createOrgPerson({ organizationId: organization.id, name: 'Dana Rep', createdByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = repCollectionsRequest(organization.id, project.id, {
      orgPersonId: rep.id,
      company: 'Acme Inc',
      collectionType: 'expansion',
      planFrom: 'Starter',
      planTo: 'Pro',
      amount: 750,
      occurredAt: '2026-08-24',
      note: 'Upsell after QBR',
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { entry: { orgPersonId: string | null; planFrom: string | null; planTo: string | null; note: string | null } };
    expect(body.entry).toMatchObject({ orgPersonId: rep.id, planFrom: 'Starter', planTo: 'Pro', note: 'Upsell after QBR' });
  });
});
