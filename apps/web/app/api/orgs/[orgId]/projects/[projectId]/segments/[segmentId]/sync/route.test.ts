import { randomBytes } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  createOrganizationWithOwner,
  createProject,
  createSegment,
  createSharedCredential,
  CRM_WEBHOOK_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  CRM_WEBHOOK_PLUGIN_ID,
  CRM_WEBHOOK_PLUGIN_MANIFEST_YAML,
  decideResourceAttachment,
  ensureUserForFirebaseSession,
  inviteMemberToOrganization,
  META_CUSTOM_AUDIENCE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  META_CUSTOM_AUDIENCE_NAME_CONFIG_FIELD,
  META_CUSTOM_AUDIENCE_PLUGIN_ID,
  META_CUSTOM_AUDIENCE_PLUGIN_MANIFEST_YAML,
  registerSchemaDefinition,
  requestResourceAttachment,
  setSharedCredentialSecret,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { installPlugin, registerPluginManifest, disablePlugin } from '@/lib/orgs/mutations';
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

async function setupOrgProjectSegment(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
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
  return { ownerSession, owner, organization, project, segment };
}

/** Invites+accepts a project-scoped member (KAN-135) so a test can assert the KAN-136 gap is closed. */
async function inviteProjectScopedMember(
  organizationId: string,
  projectId: string,
  role: 'project_admin' | 'editor' | 'operator',
  invitedByUserId: string,
): Promise<DecodedIdToken> {
  const email = uniqueEmail(`project-${role}`);
  const invitation = await inviteMemberToOrganization({ organizationId, email, role, invitedByUserId, projectId });
  const session = await sessionFor(unique('uid'), email);
  const invitee = await ensureUserForFirebaseSession({ firebaseUid: session.uid, email });
  await acceptInvite({ organizationId, membershipId: invitation.id, userId: invitee.id, callerEmailVerified: true });
  return session;
}

/** Registers + installs the built-in CRM webhook plugin, fully configured with an approved `generic` credential attachment. */
async function setupInstalledCrmWebhookInstall(organizationId: string, projectId: string, ownerId: string) {
  const credential = await createSharedCredential({ organizationId, name: 'CRM webhook (test)', provider: 'generic', availableScopes: ['account'], createdByUserId: ownerId });
  await setSharedCredentialSecret({
    organizationId,
    credentialId: credential.id,
    secret: JSON.stringify({ webhookUrl: 'https://crm.example.com/hooks/growthos', bearerToken: 'tok_abc' }),
    kms: getServerKmsProvider(),
    actorId: ownerId,
  });
  const attachment = await requestResourceAttachment({ organizationId, projectId, resourceKind: 'credential', resourceId: credential.id, requestedByUserId: ownerId, scopeSelection: ['account'] });
  await decideResourceAttachment({ organizationId, attachmentId: attachment.id, decidedByUserId: ownerId, approve: true });
  await registerPluginManifest({ organizationId, manifestYaml: CRM_WEBHOOK_PLUGIN_MANIFEST_YAML, registeredByUserId: ownerId });
  return installPlugin({
    organizationId,
    projectId,
    pluginId: CRM_WEBHOOK_PLUGIN_ID,
    version: '1.0.0',
    consentedScopes: ['action:execute'],
    config: { [CRM_WEBHOOK_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: attachment.id },
    installedByUserId: ownerId,
  });
}

/** Registers + installs the built-in Meta Custom Audience plugin with an id-only config — enough to exercise the route's "recognized plugin, missing credential" path without a real Meta credential attachment. */
async function setupMetaCustomAudienceInstallWithoutCredential(organizationId: string, projectId: string, ownerId: string) {
  await registerPluginManifest({ organizationId, manifestYaml: META_CUSTOM_AUDIENCE_PLUGIN_MANIFEST_YAML, registeredByUserId: ownerId });
  return installPlugin({
    organizationId,
    projectId,
    pluginId: META_CUSTOM_AUDIENCE_PLUGIN_ID,
    version: '1.0.0',
    consentedScopes: ['action:execute'],
    config: { [META_CUSTOM_AUDIENCE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: 'nonexistent-attachment', [META_CUSTOM_AUDIENCE_NAME_CONFIG_FIELD]: 'Warm leads' },
    installedByUserId: ownerId,
  });
}

function syncRequest(orgId: string, projectId: string, segmentId: string, body?: unknown): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; segmentId: string }> } {
  return {
    request: new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/segments/${segmentId}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
    params: Promise.resolve({ orgId, projectId, segmentId }),
  };
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/segments/[segmentId]/sync', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = syncRequest('org-1', 'project-1', 'segment-1', { installId: 'install-1' });
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold dashboards.write (viewer)", async () => {
    const { owner, organization, project, segment } = await setupOrgProjectSegment('Crm Sync Route Viewer Org');
    const install = await setupInstalledCrmWebhookInstall(organization.id, project.id, owner.id);
    const viewerEmail = uniqueEmail('crm-sync-viewer');
    const invitation = await inviteMemberToOrganization({ organizationId: organization.id, email: viewerEmail, role: 'viewer', invitedByUserId: owner.id });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewerUser = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewerUser.id, callerEmailVerified: true });
    getServerSessionMock.mockResolvedValue(viewerSession);

    const { request, params } = syncRequest(organization.id, project.id, segment.id, { installId: install.id });
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 400 when installId is missing', async () => {
    const { ownerSession, organization, project, segment } = await setupOrgProjectSegment('Crm Sync Route Missing Install Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = syncRequest(organization.id, project.id, segment.id, {});
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
  });

  it('returns 404 for a segment id that does not exist', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgProjectSegment('Crm Sync Route Missing Segment Org');
    const install = await setupInstalledCrmWebhookInstall(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = syncRequest(organization.id, project.id, 'nonexistent-segment', { installId: install.id });
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it('returns 404 for an install id that does not exist', async () => {
    const { ownerSession, organization, project, segment } = await setupOrgProjectSegment('Crm Sync Route Missing Install Id Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = syncRequest(organization.id, project.id, segment.id, { installId: 'nonexistent-install' });
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });

  it('returns 409 for a disabled install', async () => {
    const { ownerSession, owner, organization, project, segment } = await setupOrgProjectSegment('Crm Sync Route Disabled Org');
    const install = await setupInstalledCrmWebhookInstall(organization.id, project.id, owner.id);
    await disablePlugin({ organizationId: organization.id, projectId: project.id, installId: install.id, performedByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = syncRequest(organization.id, project.id, segment.id, { installId: install.id });
    const response = await POST(request, { params });
    expect(response.status).toBe(409);
  });

  it('returns 400 for a non-action-type plugin install', async () => {
    const { ownerSession, owner, organization, project, segment } = await setupOrgProjectSegment('Crm Sync Route Non Action Org');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: 'id: com.example.toy-source\nversion: 1.0.0\ntype: source\ndisplay_name: Toy Source\nscopes: [ingest:write]\n', registeredByUserId: owner.id });
    const install = await installPlugin({ organizationId: organization.id, projectId: project.id, pluginId: 'com.example.toy-source', version: '1.0.0', consentedScopes: ['ingest:write'], config: {}, installedByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = syncRequest(organization.id, project.id, segment.id, { installId: install.id });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('not_an_action_plugin');
  });

  it('returns 400 for the built-in CRM webhook plugin with no configured credential attachment', async () => {
    const { ownerSession, owner, organization, project, segment } = await setupOrgProjectSegment('Crm Sync Route No Credential Org');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: CRM_WEBHOOK_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
    const install = await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: CRM_WEBHOOK_PLUGIN_ID,
      version: '1.0.0',
      consentedScopes: ['action:execute'],
      config: { [CRM_WEBHOOK_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: 'nonexistent-attachment' },
      installedByUserId: owner.id,
    });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = syncRequest(organization.id, project.id, segment.id, { installId: install.id });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('crm_credential_not_configured');
  });

  it('returns 400 for the built-in Meta Custom Audience plugin with no configured credential attachment', async () => {
    const { ownerSession, owner, organization, project, segment } = await setupOrgProjectSegment('Crm Sync Route No Meta Credential Org');
    const install = await setupMetaCustomAudienceInstallWithoutCredential(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = syncRequest(organization.id, project.id, segment.id, { installId: install.id });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('meta_audience_credential_not_configured');
  });

  it('returns 400 for an action-type install with no built-in executor', async () => {
    const { ownerSession, owner, organization, project, segment } = await setupOrgProjectSegment('Crm Sync Route Unsupported Plugin Org');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: 'id: com.example.other-action\nversion: 1.0.0\ntype: action\ndisplay_name: Other Action\nscopes: [action:execute]\n', registeredByUserId: owner.id });
    const install = await installPlugin({ organizationId: organization.id, projectId: project.id, pluginId: 'com.example.other-action', version: '1.0.0', consentedScopes: ['action:execute'], config: {}, installedByUserId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = syncRequest(organization.id, project.id, segment.id, { installId: install.id });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('unsupported_action_plugin');
  });

  it('returns 200 with a failed run when the warehouse is not configured (this test environment has no live warehouse)', async () => {
    const { ownerSession, owner, organization, project, segment } = await setupOrgProjectSegment('Crm Sync Route Warehouse Not Configured Org');
    const install = await setupInstalledCrmWebhookInstall(organization.id, project.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = syncRequest(organization.id, project.id, segment.id, { installId: install.id });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { run: { status: string; recordsAttempted: number; errorMessage: string | null } };
    expect(body.run.status).toBe('failed');
    expect(body.run.recordsAttempted).toBe(0);
    expect(body.run.errorMessage).toEqual(expect.any(String));
  });

  it('KAN-136: lets a project-scoped project_admin sync a segment in THEIR OWN project', async () => {
    const { ownerSession, owner, organization, project, segment } = await setupOrgProjectSegment('Crm Sync Route Project-Scoped Org');
    const install = await setupInstalledCrmWebhookInstall(organization.id, project.id, owner.id);
    const ownerUser = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const memberSession = await inviteProjectScopedMember(organization.id, project.id, 'project_admin', ownerUser.id);

    getServerSessionMock.mockResolvedValue(memberSession);
    const { request, params } = syncRequest(organization.id, project.id, segment.id, { installId: install.id });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
  });

  it("KAN-136 isolation: a project-scoped project_admin for one project can't sync a SIBLING project's segment", async () => {
    const { ownerSession, owner, organization, project, segment } = await setupOrgProjectSegment('Crm Sync Route Sibling Project Org');
    const install = await setupInstalledCrmWebhookInstall(organization.id, project.id, owner.id);
    const ownerUser = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other Project' });
    const memberSession = await inviteProjectScopedMember(organization.id, otherProject.id, 'project_admin', ownerUser.id);

    getServerSessionMock.mockResolvedValue(memberSession);
    const { request, params } = syncRequest(organization.id, project.id, segment.id, { installId: install.id });
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });
});
