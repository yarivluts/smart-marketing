import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  createOrganizationWithOwner,
  createProject,
  disablePlugin,
  ensureUserForFirebaseSession,
  registerSchemaDefinition,
  GA4_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  GA4_PLUGIN_ID,
  GA4_PLUGIN_MANIFEST_YAML,
  GA4_PROPERTY_ID_CONFIG_FIELD,
  STRIPE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  STRIPE_PLUGIN_ID,
  STRIPE_PLUGIN_MANIFEST_YAML,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { installPlugin, registerPluginManifest } from '@/lib/orgs/mutations';
import { POST } from './route';

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

const SOURCE_MANIFEST_YAML = `
id: com.example.toy-source
version: 1.0.0
type: source
display_name: Toy Source Plugin
scopes: [ingest:write]
`;

const ACTION_MANIFEST_YAML = `
id: com.example.toy-action
version: 1.0.0
type: action
display_name: Toy Action Plugin
scopes: [action:execute]
`;

async function setupInstalledSourcePlugin(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const environment = environments.find((e) => e.name === 'dev')!;
  await registerPluginManifest({ organizationId: organization.id, manifestYaml: SOURCE_MANIFEST_YAML, registeredByUserId: owner.id });
  const install = await installPlugin({
    organizationId: organization.id,
    projectId: project.id,
    pluginId: 'com.example.toy-source',
    version: '1.0.0',
    consentedScopes: ['ingest:write'],
    config: {},
    installedByUserId: owner.id,
  });
  await registerSchemaDefinition({
    organizationId: organization.id,
    projectId: project.id,
    kind: 'event',
    name: 'toy_counter_tick',
    fields: [{ name: 'counter', type: 'number', isRequired: true, isPii: false, isIdentityKey: false }],
    createdByUserId: owner.id,
  });
  return { ownerSession, organization, project, environment, install };
}

function runRequest(
  orgId: string,
  projectId: string,
  installId: string,
  body?: unknown,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; installId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/plugins/${installId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
    params: Promise.resolve({ orgId, projectId, installId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/plugins/[installId]/run', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = runRequest('org-1', 'project-1', 'install-1', { environmentId: 'env-1' });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it('triggers a sync run and returns its succeeded status', async () => {
    const { ownerSession, organization, project, environment, install } = await setupInstalledSourcePlugin('Source Run Route Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = runRequest(organization.id, project.id, install.id, { environmentId: environment.id });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { run: { status: string; recordsAccepted: number } };
    expect(body.run.status).toBe('succeeded');
    expect(body.run.recordsAccepted).toBe(3);
  });

  it('returns 400 when environmentId is missing', async () => {
    const { ownerSession, organization, project, install } = await setupInstalledSourcePlugin('Source Run Route Missing Env Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = runRequest(organization.id, project.id, install.id, {});
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
  });

  it('returns 404 for an environment id that does not exist', async () => {
    const { ownerSession, organization, project, install } = await setupInstalledSourcePlugin('Source Run Route Bad Env Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = runRequest(organization.id, project.id, install.id, { environmentId: 'does-not-exist' });
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it('returns 409 for a disabled install', async () => {
    const { ownerSession, organization, project, environment, install } = await setupInstalledSourcePlugin('Source Run Route Disabled Org');
    await disablePlugin({ organizationId: organization.id, projectId: project.id, installId: install.id, performedByUserId: install.installed_by });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = runRequest(organization.id, project.id, install.id, { environmentId: environment.id });
    const response = await POST(request, { params });
    expect(response.status).toBe(409);
  });

  it('returns 400 for a non-source-type plugin install', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: unique('Source Run Route Non Source Org'), ownerUserId: owner.id });
    const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
    const environment = environments.find((e) => e.name === 'dev')!;
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: ACTION_MANIFEST_YAML, registeredByUserId: owner.id });
    const install = await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: 'com.example.toy-action',
      version: '1.0.0',
      consentedScopes: ['action:execute'],
      config: {},
      installedByUserId: owner.id,
    });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = runRequest(organization.id, project.id, install.id, { environmentId: environment.id });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
  });

  it('returns 400 for the built-in Stripe plugin with no configured credential attachment (KAN-49)', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: unique('Stripe Run Route Org'), ownerUserId: owner.id });
    const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
    const environment = environments.find((e) => e.name === 'dev')!;
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: STRIPE_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
    const install = await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: STRIPE_PLUGIN_ID,
      version: '1.0.0',
      consentedScopes: ['ingest:write', 'schema:write'],
      config: { [STRIPE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: 'nonexistent-attachment' },
      installedByUserId: owner.id,
    });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = runRequest(organization.id, project.id, install.id, { environmentId: environment.id });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('stripe_credential_not_configured');
  });

  it('returns 400 for the built-in GA4 plugin with no configured credential attachment (KAN-52)', async () => {
    const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
    const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { organization } = await createOrganizationWithOwner({ name: unique('GA4 Run Route Org'), ownerUserId: owner.id });
    const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
    const environment = environments.find((e) => e.name === 'dev')!;
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: GA4_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
    const install = await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: GA4_PLUGIN_ID,
      version: '1.0.0',
      consentedScopes: ['ingest:write', 'schema:write'],
      config: { [GA4_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: 'nonexistent-attachment', [GA4_PROPERTY_ID_CONFIG_FIELD]: 'properties/123' },
      installedByUserId: owner.id,
    });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = runRequest(organization.id, project.id, install.id, { environmentId: environment.id });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('ga4_credential_not_configured');
  });
});
