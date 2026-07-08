import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
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

async function setupOrg(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  return { ownerSession, owner, organization };
}

function pluginsRequest(orgId: string, body?: unknown): { request: NextRequest; params: Promise<{ orgId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/plugins`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId }),
  };
}

const VALID_MANIFEST_YAML = `
id: com.example.shopify-pack
version: 1.0.0
type: source
display_name: Shopify Commerce Pack
scopes: [ingest:write, schema:write]
`;

describe('GET /api/orgs/[orgId]/plugins', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = pluginsRequest('org-1');
    expect((await GET(request, { params })).status).toBe(401);
  });

  it('returns 404 for a caller with no active membership in the org', async () => {
    const session = await sessionFor(unique('uid'), uniqueEmail('outsider'));
    getServerSessionMock.mockResolvedValue(session);
    const { request, params } = pluginsRequest('does-not-exist-org');
    expect((await GET(request, { params })).status).toBe(404);
  });

  it("rejects a member whose role doesn't hold plugin.install (viewer)", async () => {
    const { organization, owner } = await setupOrg('Plugin Registry Route Viewer Org');
    const viewerEmail = uniqueEmail('plugin-route-viewer');
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = pluginsRequest(organization.id);
    expect((await GET(request, { params })).status).toBe(403);
  });

  it('lets an org_owner list manifests (empty when none registered yet)', async () => {
    const { ownerSession, organization } = await setupOrg('Plugin Registry Route List Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = pluginsRequest(organization.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ manifests: [] });
  });
});

describe('POST /api/orgs/[orgId]/plugins', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = pluginsRequest('org-1', { manifestYaml: VALID_MANIFEST_YAML });
    expect((await POST(request, { params })).status).toBe(401);
  });

  it('rejects a missing manifestYaml', async () => {
    const { ownerSession, organization } = await setupOrg('Plugin Registry Route Missing Body Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = pluginsRequest(organization.id, {});
    expect((await POST(request, { params })).status).toBe(400);
  });

  it('rejects an invalid manifest with its validation reasons', async () => {
    const { ownerSession, organization } = await setupOrg('Plugin Registry Route Invalid Manifest Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = pluginsRequest(organization.id, { manifestYaml: 'id: not valid at all' });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; reasons: string[] };
    expect(body.error).toBe('invalid_manifest');
    expect(body.reasons.length).toBeGreaterThan(0);
  });

  it('registers a manifest, then lists it', async () => {
    const { ownerSession, organization } = await setupOrg('Plugin Registry Route Register Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = pluginsRequest(organization.id, { manifestYaml: VALID_MANIFEST_YAML });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { manifest: { pluginId: string; version: string } };
    expect(body.manifest.pluginId).toBe('com.example.shopify-pack');
    expect(body.manifest.version).toBe('1.0.0');

    const listResponse = await GET(pluginsRequest(organization.id).request, { params });
    const listed = (await listResponse.json()) as { manifests: Array<Record<string, unknown>> };
    expect(listed.manifests).toHaveLength(1);
  });

  it('rejects registering the same plugin id + version twice', async () => {
    const { ownerSession, organization } = await setupOrg('Plugin Registry Route Duplicate Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const first = pluginsRequest(organization.id, { manifestYaml: VALID_MANIFEST_YAML });
    expect((await POST(first.request, { params: first.params })).status).toBe(201);

    const second = pluginsRequest(organization.id, { manifestYaml: VALID_MANIFEST_YAML });
    expect((await POST(second.request, { params: second.params })).status).toBe(409);
  });
});
