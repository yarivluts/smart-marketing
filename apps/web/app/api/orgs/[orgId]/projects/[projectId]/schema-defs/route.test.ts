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

function schemaDefsRequest(
  orgId: string,
  projectId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/schema-defs`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

const validFields = [
  { name: 'order_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'user_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
];

describe('GET /api/orgs/[orgId]/projects/[projectId]/schema-defs', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = schemaDefsRequest('org-1', 'project-1');
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = schemaDefsRequest('does-not-exist-org', 'does-not-exist-project');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });

  it("rejects a member whose role doesn't hold schema.write (viewer)", async () => {
    const { organization, project } = await setupOrgProject('Schema List Org');
    const viewerEmail = uniqueEmail('schema-list-viewer');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('schema-list-owner-2') });
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
    const { request, params } = schemaDefsRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(403);
  });

  it('lets an org_owner list schema defs for the project (empty when none registered yet)', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Schema List Owner Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = schemaDefsRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ schemaDefs: [] });
  });

  it("returns 404 for a project id that doesn't belong to this org, matching POST on the same resource", async () => {
    const { ownerSession, organization } = await setupOrgProject('Schema List Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = schemaDefsRequest(organization.id, 'does-not-exist-project');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });
});

describe('POST /api/orgs/[orgId]/projects/[projectId]/schema-defs', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = schemaDefsRequest('org-1', 'project-1', {
      kind: 'event',
      name: 'order_completed',
      fields: validFields,
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('rejects an invalid kind, a missing name, and an empty field list', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Schema Validation Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const badKind = schemaDefsRequest(organization.id, project.id, { kind: 'not_a_kind', name: 'x', fields: validFields });
    expect((await POST(badKind.request, { params: badKind.params })).status).toBe(400);

    const missingName = schemaDefsRequest(organization.id, project.id, { kind: 'event', name: '', fields: validFields });
    expect((await POST(missingName.request, { params: missingName.params })).status).toBe(400);

    const emptyFields = schemaDefsRequest(organization.id, project.id, { kind: 'event', name: 'x', fields: [] });
    expect((await POST(emptyFields.request, { params: emptyFields.params })).status).toBe(400);
  });

  it('registers v1 of a new schema, then lists it', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Schema Register Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = schemaDefsRequest(organization.id, project.id, {
      kind: 'event',
      name: 'order_completed',
      fields: validFields,
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { schemaDef: { id: string; version: number; status: string } };
    expect(body.schemaDef.version).toBe(1);
    expect(body.schemaDef.status).toBe('active');

    const listResponse = await GET(schemaDefsRequest(organization.id, project.id).request, { params });
    const listed = (await listResponse.json()) as { schemaDefs: Array<Record<string, unknown>> };
    expect(listed.schemaDefs).toHaveLength(1);
    expect(listed.schemaDefs[0]).toMatchObject({ id: body.schemaDef.id, kind: 'event', name: 'order_completed', version: 1 });
  });

  it('rejects registering the same kind+name twice', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Schema Duplicate Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const first = schemaDefsRequest(organization.id, project.id, { kind: 'event', name: 'order_completed', fields: validFields });
    expect((await POST(first.request, { params: first.params })).status).toBe(201);

    const second = schemaDefsRequest(organization.id, project.id, { kind: 'event', name: 'order_completed', fields: validFields });
    const response = await POST(second.request, { params: second.params });
    expect(response.status).toBe(409);
  });
});
