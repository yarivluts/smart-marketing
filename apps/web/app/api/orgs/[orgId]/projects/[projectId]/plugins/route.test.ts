import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { registerPluginManifest } from '@/lib/orgs/mutations';
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

function pluginInstallsRequest(
  orgId: string,
  projectId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/plugins`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: Promise.resolve({ orgId, projectId }),
  };
}

const VALID_MANIFEST_YAML = `
id: com.example.shopify-pack
version: 1.0.0
type: source
display_name: Shopify Commerce Pack
scopes: [ingest:write, schema:write]
config_schema:
  shop_domain: { type: string, required: true }
`;

describe('GET /api/orgs/[orgId]/projects/[projectId]/plugins', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = pluginInstallsRequest('org-1', 'project-1');
    expect((await GET(request, { params })).status).toBe(401);
  });

  it("returns 404 for a project id that doesn't belong to this org", async () => {
    const { ownerSession, organization } = await setupOrgProject('Plugin Installs Route Wrong Project Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = pluginInstallsRequest(organization.id, 'does-not-exist-project');
    expect((await GET(request, { params })).status).toBe(404);
  });

  it('lists installs (empty when none installed yet)', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Plugin Installs Route List Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = pluginInstallsRequest(organization.id, project.id);
    const response = await GET(request, { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ installs: [] });
  });
});

describe('POST /api/orgs/[orgId]/projects/[projectId]/plugins', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = pluginInstallsRequest('org-1', 'project-1', {});
    expect((await POST(request, { params })).status).toBe(401);
  });

  it('rejects a missing pluginId/version/consentedScopes/config', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Plugin Installs Route Validation Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const missingPluginId = pluginInstallsRequest(organization.id, project.id, { version: '1.0.0', consentedScopes: [], config: {} });
    expect((await POST(missingPluginId.request, { params: missingPluginId.params })).status).toBe(400);

    const missingScopes = pluginInstallsRequest(organization.id, project.id, { pluginId: 'x', version: '1.0.0', config: {} });
    expect((await POST(missingScopes.request, { params: missingScopes.params })).status).toBe(400);

    const invalidConfig = pluginInstallsRequest(organization.id, project.id, {
      pluginId: 'x',
      version: '1.0.0',
      consentedScopes: [],
      config: 'not-an-object',
    });
    expect((await POST(invalidConfig.request, { params: invalidConfig.params })).status).toBe(400);
  });

  it('returns 404 for a manifest that was never registered', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Plugin Installs Route Missing Manifest Org');
    getServerSessionMock.mockResolvedValue(ownerSession);
    const { request, params } = pluginInstallsRequest(organization.id, project.id, {
      pluginId: 'com.example.does-not-exist',
      version: '1.0.0',
      consentedScopes: [],
      config: {},
    });
    expect((await POST(request, { params })).status).toBe(404);
  });

  it('installs a plugin end to end and rejects an install with mismatched consented scopes', async () => {
    const { ownerSession, organization, project, owner } = await setupOrgProject('Plugin Installs Route Install Org');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: VALID_MANIFEST_YAML, registeredByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const mismatched = pluginInstallsRequest(organization.id, project.id, {
      pluginId: 'com.example.shopify-pack',
      version: '1.0.0',
      consentedScopes: ['ingest:write'],
      config: { shop_domain: 'x' },
    });
    expect((await POST(mismatched.request, { params: mismatched.params })).status).toBe(400);

    const { request, params } = pluginInstallsRequest(organization.id, project.id, {
      pluginId: 'com.example.shopify-pack',
      version: '1.0.0',
      consentedScopes: ['ingest:write', 'schema:write'],
      config: { shop_domain: 'my-shop' },
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { install: { status: string } };
    expect(body.install.status).toBe('installed');

    const listResponse = await GET(pluginInstallsRequest(organization.id, project.id).request, { params });
    const listed = (await listResponse.json()) as { installs: Array<Record<string, unknown>> };
    expect(listed.installs).toHaveLength(1);
  });
});
