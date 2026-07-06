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
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const prodEnvironment = environments.find((e) => e.name === 'prod')!;
  return { ownerSession, organization, project, prodEnvironment };
}

function keysRequest(
  orgId: string,
  projectId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/keys`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

describe('GET /api/orgs/[orgId]/projects/[projectId]/keys', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = keysRequest('org-1', 'project-1');
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = keysRequest('does-not-exist-org', 'does-not-exist-project');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });

  it("rejects a member whose role doesn't hold keys.manage (viewer)", async () => {
    const { organization, project } = await setupOrgProject('Keys List Org');
    const viewerEmail = uniqueEmail('keys-list-viewer');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('keys-list-owner-2') });
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
    const { request, params } = keysRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(403);
  });

  it('lets an org_owner list keys for the project (empty when none minted yet)', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Keys List Owner Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = keysRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ apiKeys: [] });
  });

  it("returns 404 for a project id that doesn't belong to this org, matching POST/DELETE on the same resource", async () => {
    const { ownerSession, organization } = await setupOrgProject('Keys List Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = keysRequest(organization.id, 'does-not-exist-project');
    const response = await GET(request, { params });
    expect(response.status).toBe(404);
  });
});

describe('POST /api/orgs/[orgId]/projects/[projectId]/keys', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = keysRequest('org-1', 'project-1', {
      name: 'CI key',
      environmentId: 'env-1',
      scopes: ['ingest.write'],
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('rejects an invalid scope list and a missing environment id', async () => {
    const { ownerSession, organization, project, prodEnvironment } = await setupOrgProject('Keys Validation Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const badScopes = keysRequest(organization.id, project.id, {
      name: 'X',
      environmentId: prodEnvironment.id,
      scopes: ['project.manage'],
    });
    expect((await POST(badScopes.request, { params: badScopes.params })).status).toBe(400);

    const emptyScopes = keysRequest(organization.id, project.id, { name: 'X', environmentId: prodEnvironment.id, scopes: [] });
    expect((await POST(emptyScopes.request, { params: emptyScopes.params })).status).toBe(400);

    const missingEnv = keysRequest(organization.id, project.id, { name: 'X', environmentId: '', scopes: ['ingest.write'] });
    expect((await POST(missingEnv.request, { params: missingEnv.params })).status).toBe(400);
  });

  it('mints a key and returns the raw secret exactly once, then lists it without the secret', async () => {
    const { ownerSession, organization, project, prodEnvironment } = await setupOrgProject('Keys Mint Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = keysRequest(organization.id, project.id, {
      name: 'CI key',
      environmentId: prodEnvironment.id,
      scopes: ['ingest.write', 'metrics.write'],
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { apiKeyId: string; keyPrefix: string; rawKey: string };
    expect(body.apiKeyId).toEqual(expect.any(String));
    expect(body.rawKey).toMatch(/^gos_live_/);
    expect(body.keyPrefix.length).toBeLessThan(body.rawKey.length);

    const listResponse = await GET(keysRequest(organization.id, project.id).request, { params });
    const listed = (await listResponse.json()) as { apiKeys: Array<Record<string, unknown>> };
    expect(listed.apiKeys).toHaveLength(1);
    expect(listed.apiKeys[0]).toMatchObject({ id: body.apiKeyId, name: 'CI key', keyPrefix: body.keyPrefix });
    expect(listed.apiKeys[0]).not.toHaveProperty('hashedSecret');
    expect(listed.apiKeys[0]).not.toHaveProperty('rawKey');
  });
});
