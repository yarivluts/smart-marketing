import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  createSegment,
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

function segmentsRequest(
  orgId: string,
  projectId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/segments`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('GET /api/orgs/[orgId]/projects/[projectId]/segments', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = segmentsRequest('org-1', 'project-1');
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = segmentsRequest('does-not-exist-org', 'does-not-exist-project');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });

  it("rejects a member whose role doesn't hold dashboards.write (viewer)", async () => {
    const { organization, project } = await setupOrgProject('Segment List Org');
    const viewerEmail = uniqueEmail('segment-list-viewer');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('segment-list-owner-2') });
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = segmentsRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(403);
  });

  it('lets an org_owner list segments for the project (empty when none created yet)', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Segment List Owner Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = segmentsRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ segments: [] });
  });

  it("returns 404 for a project id that doesn't belong to this org", async () => {
    const { ownerSession, organization } = await setupOrgProject('Segment List Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = segmentsRequest(organization.id, 'does-not-exist-project');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });

  it('lists a segment created via the service layer (the MCP create_segment tool path)', async () => {
    const { ownerSession, organization, project, owner } = await setupOrgProject('Segment List With Data Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'entity',
      name: 'customer',
      fields: [
        { name: 'customer_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
        { name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
      ],
      createdByUserId: owner.id,
    });
    const segment = await createSegment({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
      createdByUserId: owner.id,
    });

    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = segmentsRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { segments: Array<{ id: string; name: string; schemaName: string; filterCount: number }> };
    expect(body.segments).toHaveLength(1);
    expect(body.segments[0]).toMatchObject({ id: segment.id, name: 'Pro customers', schemaName: 'customer', filterCount: 1 });
  });
});

describe('POST /api/orgs/[orgId]/projects/[projectId]/segments', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = segmentsRequest('org-1', 'project-1', { name: 'Segment' });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('rejects a malformed request body (400, shape validation)', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Segment Create Shape Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = segmentsRequest(organization.id, project.id, { name: '   ' });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
  });

  it('rejects a request whose business rules fail (unregistered entity schema) with 400 + reasons', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Segment Create Invalid Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = segmentsRequest(organization.id, project.id, {
      name: 'Segment',
      schemaName: 'does_not_exist',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; reasons: string[] };
    expect(body.error).toBe('invalid_segment');
    expect(body.reasons.length).toBeGreaterThan(0);
  });

  it('creates a segment, then lists it', async () => {
    const { ownerSession, organization, project, owner } = await setupOrgProject('Segment Create Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'entity',
      name: 'customer',
      fields: [
        { name: 'customer_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
        { name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
      ],
      createdByUserId: owner.id,
    });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = segmentsRequest(organization.id, project.id, {
      name: 'Pro customers',
      schemaName: 'customer',
      filters: [{ field: 'plan', op: '=', value: 'pro' }],
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { segment: { id: string; name: string } };
    expect(body.segment).toMatchObject({ name: 'Pro customers' });

    const listResponse = await GET(segmentsRequest(organization.id, project.id).request, { params });
    const listed = (await listResponse.json()) as { segments: Array<{ id: string }> };
    expect(listed.segments).toHaveLength(1);
    expect(listed.segments[0].id).toBe(body.segment.id);
  });
});
