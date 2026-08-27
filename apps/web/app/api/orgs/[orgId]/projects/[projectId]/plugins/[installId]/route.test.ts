import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { NextRequest } from 'next/server';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, installPlugin, registerPluginManifest, uninstallPlugin } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { PATCH } from './route';

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

const MANIFEST_YAML = `
id: com.example.shopify-pack
version: 1.0.0
type: source
display_name: Shopify Commerce Pack
scopes: [ingest:write]
config_schema:
  shop_domain: { type: string, required: true }
registers:
  entities: [order]
  events: []
`;

async function setupInstalledPlugin(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  await registerPluginManifest({ organizationId: organization.id, manifestYaml: MANIFEST_YAML, registeredByUserId: owner.id });
  const install = await installPlugin({
    organizationId: organization.id,
    projectId: project.id,
    pluginId: 'com.example.shopify-pack',
    version: '1.0.0',
    consentedScopes: ['ingest:write'],
    config: { shop_domain: 'old-shop.myshopify.com' },
    installedByUserId: owner.id,
  });
  return { owner, ownerSession, organization, project, install };
}

function patchRequest(orgId: string, projectId: string, installId: string, body: unknown): NextRequest {
  return new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/plugins/${installId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/orgs/[orgId]/projects/[projectId]/plugins/[installId]', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const response = await PATCH(patchRequest('org-1', 'project-1', 'install-1', { config: { shop_domain: 'x' } }), {
      params: Promise.resolve({ orgId: 'org-1', projectId: 'project-1', installId: 'install-1' }),
    });
    expect(response.status).toBe(401);
  });

  it('returns 400 when config is missing or not an object', async () => {
    const { ownerSession, organization, project, install } = await setupInstalledPlugin('Plugin Config Route Missing Body Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await PATCH(patchRequest(organization.id, project.id, install.id, {}), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, installId: install.id }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_config' });
  });

  it('returns 404 for an install that does not exist in this project', async () => {
    const { ownerSession, organization, project } = await setupInstalledPlugin('Plugin Config Route Missing Install Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await PATCH(patchRequest(organization.id, project.id, 'does-not-exist', { config: { shop_domain: 'x' } }), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, installId: 'does-not-exist' }),
    });
    expect(response.status).toBe(404);
  });

  it('returns 400 with reasons when the config no longer satisfies the manifest schema', async () => {
    const { ownerSession, organization, project, install } = await setupInstalledPlugin('Plugin Config Route Invalid Config Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await PATCH(patchRequest(organization.id, project.id, install.id, { config: {} }), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, installId: install.id }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; reasons: string[] };
    expect(body.error).toBe('invalid_config');
    expect(body.reasons.length).toBeGreaterThan(0);
  });

  it('returns 409 for an uninstalled install', async () => {
    const { owner, ownerSession, organization, project, install } = await setupInstalledPlugin('Plugin Config Route Uninstalled Org');
    await uninstallPlugin({ organizationId: organization.id, projectId: project.id, installId: install.id, performedByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await PATCH(patchRequest(organization.id, project.id, install.id, { config: { shop_domain: 'new-shop.myshopify.com' } }), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, installId: install.id }),
    });
    expect(response.status).toBe(409);
  });

  it('edits an installed install’s config and returns the updated view', async () => {
    const { ownerSession, organization, project, install } = await setupInstalledPlugin('Plugin Config Route Edit Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const response = await PATCH(patchRequest(organization.id, project.id, install.id, { config: { shop_domain: 'new-shop.myshopify.com' } }), {
      params: Promise.resolve({ orgId: organization.id, projectId: project.id, installId: install.id }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { install: { config: Record<string, unknown> } };
    expect(body.install.config).toEqual({ shop_domain: 'new-shop.myshopify.com' });
  });
});
