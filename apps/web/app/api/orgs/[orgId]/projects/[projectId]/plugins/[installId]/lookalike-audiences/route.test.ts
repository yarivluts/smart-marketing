import { randomBytes } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  decideResourceAttachment,
  disablePlugin,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  META_CUSTOM_AUDIENCE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  META_CUSTOM_AUDIENCE_NAME_CONFIG_FIELD,
  META_CUSTOM_AUDIENCE_PLUGIN_ID,
  META_CUSTOM_AUDIENCE_PLUGIN_MANIFEST_YAML,
  PluginInstallModel,
  requestResourceAttachment,
  setSharedCredentialSecret,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { installPlugin, registerPluginManifest } from '@/lib/orgs/mutations';
import { getServerKmsProvider } from '@/lib/vault/kms-provider';
import { POST } from './route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  process.env.GROWTHOS_VAULT_KEYS = JSON.stringify({
    currentKeyId: 'v1',
    keys: { v1: randomBytes(32).toString('base64') },
  });
  await ensureFirestoreOrm();
});

beforeEach(() => {
  getServerSessionMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
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

/** Registers + installs the built-in Meta Custom Audience plugin, fully configured with an approved `meta_ads` credential attachment, optionally already carrying a seed audience id. */
async function setupInstalledMetaCustomAudiencePlugin(organizationId: string, projectId: string, ownerId: string, options: { seedAudienceId?: string } = {}) {
  const credential = await createSharedCredential({ organizationId, name: 'Meta Ads (test)', provider: 'meta_ads', availableScopes: ['account'], createdByUserId: ownerId });
  await setSharedCredentialSecret({
    organizationId,
    credentialId: credential.id,
    secret: JSON.stringify({ accessToken: 'access-token-1', adAccountId: '999', pageId: 'page-1' }),
    kms: getServerKmsProvider(),
    actorId: ownerId,
  });
  const attachment = await requestResourceAttachment({ organizationId, projectId, resourceKind: 'credential', resourceId: credential.id, requestedByUserId: ownerId, scopeSelection: ['account'] });
  await decideResourceAttachment({ organizationId, attachmentId: attachment.id, decidedByUserId: ownerId, approve: true });
  await registerPluginManifest({ organizationId, manifestYaml: META_CUSTOM_AUDIENCE_PLUGIN_MANIFEST_YAML, registeredByUserId: ownerId });
  let install = await installPlugin({
    organizationId,
    projectId,
    pluginId: META_CUSTOM_AUDIENCE_PLUGIN_ID,
    version: '1.0.0',
    consentedScopes: ['action:execute'],
    config: { [META_CUSTOM_AUDIENCE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: attachment.id, [META_CUSTOM_AUDIENCE_NAME_CONFIG_FIELD]: 'Warm leads' },
    installedByUserId: ownerId,
  });
  if (options.seedAudienceId) {
    install.sink_external_ref = options.seedAudienceId;
    await install.save();
    install = (await PluginInstallModel.init(install.id, { organization_id: organizationId, project_id: projectId })) ?? install;
  }
  return install;
}

function lookalikeRequest(orgId: string, projectId: string, installId: string, body?: unknown): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; installId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/plugins/${installId}/lookalike-audiences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
    params: Promise.resolve({ orgId, projectId, installId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/plugins/[installId]/lookalike-audiences', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = lookalikeRequest('org-1', 'project-1', 'install-1', { name: 'x', country: 'US', ratio: 0.05 });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold plugin.install (viewer)", async () => {
    const { owner, organization, project } = await setupOrgProject('Lookalike Route Viewer Org');
    const install = await setupInstalledMetaCustomAudiencePlugin(organization.id, project.id, owner.id, { seedAudienceId: 'audience-seed-1' });
    const viewerEmail = uniqueEmail('lookalike-viewer');
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewerUser = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewerUser.id, callerEmailVerified: true });
    getServerSessionMock.mockResolvedValue(viewerSession);

    const { request, params } = lookalikeRequest(organization.id, project.id, install.id, { name: 'x', country: 'US', ratio: 0.05 });
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 400 when name/country/ratio are missing', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgProject('Lookalike Route Missing Fields Org');
    const install = await setupInstalledMetaCustomAudiencePlugin(organization.id, project.id, owner.id, { seedAudienceId: 'audience-seed-1' });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = lookalikeRequest(organization.id, project.id, install.id, {});
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
  });

  it('returns 404 for an install id that does not exist', async () => {
    const { ownerSession, organization, project } = await setupOrgProject('Lookalike Route Missing Install Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = lookalikeRequest(organization.id, project.id, 'nonexistent-install', { name: 'x', country: 'US', ratio: 0.05 });
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it('returns 409 for a disabled install', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgProject('Lookalike Route Disabled Org');
    const install = await setupInstalledMetaCustomAudiencePlugin(organization.id, project.id, owner.id, { seedAudienceId: 'audience-seed-1' });
    await disablePlugin({ organizationId: organization.id, projectId: project.id, installId: install.id, performedByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = lookalikeRequest(organization.id, project.id, install.id, { name: 'x', country: 'US', ratio: 0.05 });
    const response = await POST(request, { params });
    expect(response.status).toBe(409);
  });

  it('returns 409 when the install has no seed Custom Audience yet', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgProject('Lookalike Route No Seed Org');
    const install = await setupInstalledMetaCustomAudiencePlugin(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = lookalikeRequest(organization.id, project.id, install.id, { name: 'x', country: 'US', ratio: 0.05 });
    const response = await POST(request, { params });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('seed_audience_not_ready');
  });

  it('returns 400 for a non-Meta-Custom-Audience plugin install', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgProject('Lookalike Route Wrong Plugin Org');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: 'id: com.example.other-action\nversion: 1.0.0\ntype: action\ndisplay_name: Other Action\nscopes: [action:execute]\n', registeredByUserId: owner.id });
    const install = await installPlugin({ organizationId: organization.id, projectId: project.id, pluginId: 'com.example.other-action', version: '1.0.0', consentedScopes: ['action:execute'], config: {}, installedByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = lookalikeRequest(organization.id, project.id, install.id, { name: 'x', country: 'US', ratio: 0.05 });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('not_meta_custom_audience_plugin');
  });

  it('returns 400 for an invalid country/ratio', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgProject('Lookalike Route Invalid Org');
    const install = await setupInstalledMetaCustomAudiencePlugin(organization.id, project.id, owner.id, { seedAudienceId: 'audience-seed-1' });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = lookalikeRequest(organization.id, project.id, install.id, { name: 'x', country: 'usa', ratio: 0.5 });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('invalid_request');
  });

  it('creates a real Lookalike Audience and returns it', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgProject('Lookalike Route Success Org');
    const install = await setupInstalledMetaCustomAudiencePlugin(organization.id, project.id, owner.id, { seedAudienceId: 'audience-seed-1' });
    getServerSessionMock.mockResolvedValue(ownerSession);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 'audience-lookalike-1' }), text: async () => '{}' }) as unknown as Response),
    );

    const { request, params } = lookalikeRequest(organization.id, project.id, install.id, { name: 'Warm leads - Lookalike 5%', country: 'US', ratio: 0.05 });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { audience: { audienceId: string; originAudienceId: string; country: string; ratio: number } };
    expect(body.audience.audienceId).toBe('audience-lookalike-1');
    expect(body.audience.originAudienceId).toBe('audience-seed-1');
    expect(body.audience.country).toBe('US');
    expect(body.audience.ratio).toBe(0.05);
  });
});
