import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { acceptInvite, createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, inviteMemberToOrganization } from '@growthos/firebase-orm-models';
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
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const prodEnvironment = environments.find((e) => e.name === 'prod')!;
  return { ownerSession, organization, project, prodEnvironment };
}

function hookEndpointsRequest(
  orgId: string,
  projectId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/hook-endpoints`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('GET /api/orgs/[orgId]/projects/[projectId]/hook-endpoints', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = hookEndpointsRequest('org-1', 'project-1');
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold ingest.write (viewer)", async () => {
    const { organization, project } = await setupOrgProject('Hooks List Org');
    const viewerEmail = uniqueEmail('hooks-list-viewer');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('hooks-list-owner-2') });
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = hookEndpointsRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(403);
  });

  it('lets an org_owner list hook endpoints for the project (empty when none created yet)', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Hooks List Owner Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = hookEndpointsRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hookEndpoints: [] });
  });

  it("returns 404 for a project id that doesn't belong to this org", async () => {
    const { ownerSession, organization } = await setupOrgProject('Hooks List Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = hookEndpointsRequest(organization.id, 'does-not-exist-project');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });
});

describe('POST /api/orgs/[orgId]/projects/[projectId]/hook-endpoints', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = hookEndpointsRequest('org-1', 'project-1', { name: 'X', environmentId: 'env-1', signatureMode: 'none' });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('rejects a missing name, missing environment, and an invalid signature mode', async () => {
    const { ownerSession, organization, project, prodEnvironment } = await setupOrgProject('Hooks Validation Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const missingName = hookEndpointsRequest(organization.id, project.id, { name: '', environmentId: prodEnvironment.id, signatureMode: 'none' });
    expect((await POST(missingName.request, { params: missingName.params })).status).toBe(400);

    const missingEnv = hookEndpointsRequest(organization.id, project.id, { name: 'X', environmentId: '', signatureMode: 'none' });
    expect((await POST(missingEnv.request, { params: missingEnv.params })).status).toBe(400);

    const badMode = hookEndpointsRequest(organization.id, project.id, { name: 'X', environmentId: prodEnvironment.id, signatureMode: 'rot13' });
    expect((await POST(badMode.request, { params: badMode.params })).status).toBe(400);
  });

  it('rejects an hmac_sha256 endpoint with no signature header name', async () => {
    const { ownerSession, organization, project, prodEnvironment } = await setupOrgProject('Hooks Missing Header Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = hookEndpointsRequest(organization.id, project.id, {
      name: 'X',
      environmentId: prodEnvironment.id,
      signatureMode: 'hmac_sha256',
    });
    expect((await POST(request, { params })).status).toBe(400);
  });

  it('creates an endpoint and lists it', async () => {
    const { ownerSession, organization, project, prodEnvironment } = await setupOrgProject('Hooks Create Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = hookEndpointsRequest(organization.id, project.id, {
      name: 'Zapier',
      environmentId: prodEnvironment.id,
      signatureMode: 'none',
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { hookEndpointId: string; hookId: string };
    expect(body.hookEndpointId).toEqual(expect.any(String));
    expect(body.hookId).toEqual(expect.any(String));

    const listResponse = await GET(hookEndpointsRequest(organization.id, project.id).request, { params });
    const listed = (await listResponse.json()) as { hookEndpoints: Array<Record<string, unknown>> };
    expect(listed.hookEndpoints).toHaveLength(1);
    expect(listed.hookEndpoints[0]).toMatchObject({ id: body.hookEndpointId, name: 'Zapier', hookId: body.hookId, signatureMode: 'none' });
  });
});
