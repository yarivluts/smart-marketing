import { randomBytes } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  approveAutomationAction,
  AutomationActionModel,
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  decideResourceAttachment,
  ensureAutomationTargetSeeded,
  ensureUserForFirebaseSession,
  executeAutomationAction,
  GOOGLE_ADS_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  GOOGLE_ADS_MANAGE_PLUGIN_ID,
  GOOGLE_ADS_MANAGE_PLUGIN_MANIFEST_YAML,
  installPlugin,
  inviteMemberToOrganization,
  META_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  META_MANAGE_PLUGIN_ID,
  META_MANAGE_PLUGIN_MANIFEST_YAML,
  proposeAutomationBudgetChangeAction,
  registerPluginManifest,
  requestResourceAttachment,
  setResourceAttachmentWriteTier,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
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

function rollbackRequest(
  orgId: string,
  projectId: string,
  actionId: string,
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; actionId: string }> } {
  return {
    request: new NextRequest(
      `https://growthos.test/api/orgs/${orgId}/projects/${projectId}/automation/actions/${actionId}/rollback`,
      { method: 'POST' },
    ),
    params: Promise.resolve({ orgId, projectId, actionId }),
  };
}

async function setupOrgWithProject(orgName: string) {
  const ownerSession = await sessionFor(unique('uid'), uniqueEmail('owner'));
  const owner = await ensureUserForFirebaseSession({ firebaseUid: ownerSession.uid, email: ownerSession.email as string });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { ownerSession, owner, organization, project };
}

async function seedTarget(organizationId: string, projectId: string, seededByUserId: string, initialDailyBudgetUsd = 100) {
  return ensureAutomationTargetSeeded({
    organizationId,
    projectId,
    environmentId: 'live',
    targetId: unique('campaign'),
    targetType: 'campaign',
    label: 'Summer Sale',
    initialDailyBudgetUsd,
    seededByUserId,
  });
}

/** Mirrors `execute/route.test.ts`'s own helper: seeds an approved credential connection at the given write tier and a target linked to it. */
async function seedTargetWithConnection(
  organizationId: string,
  projectId: string,
  ownerId: string,
  provider: 'google_ads' | 'meta_ads' | 'stripe',
  tier: 'read' | 'optimize' | 'manage',
) {
  const credentialNames: Record<typeof provider, string> = {
    google_ads: 'Agency Google Ads MCC',
    meta_ads: 'Agency Meta Ads',
    stripe: 'Agency Stripe Account',
  };
  const credential = await createSharedCredential({
    organizationId,
    name: credentialNames[provider],
    provider,
    availableScopes: ['act_1'],
    createdByUserId: ownerId,
  });
  const attachment = await requestResourceAttachment({
    organizationId,
    projectId,
    resourceKind: 'credential',
    resourceId: credential.id,
    requestedByUserId: ownerId,
    scopeSelection: ['act_1'],
  });
  await decideResourceAttachment({ organizationId, attachmentId: attachment.id, decidedByUserId: ownerId, approve: true });
  if (tier !== 'read') {
    await setResourceAttachmentWriteTier({ organizationId, attachmentId: attachment.id, tier, actorId: ownerId });
  }

  const target = await ensureAutomationTargetSeeded({
    organizationId,
    projectId,
    environmentId: 'live',
    targetId: unique('campaign'),
    targetType: 'campaign',
    label: 'Summer Sale',
    initialDailyBudgetUsd: 100,
    seededByUserId: ownerId,
    resourceAttachmentId: attachment.id,
  });

  return { credential, target, attachment };
}

/** Proposes + approves a plain budget-change action against `target`, returning it in the `approved` state. */
async function approvedBudgetChangeAction(organizationId: string, projectId: string, targetId: string, ownerId: string) {
  const proposed = await proposeAutomationBudgetChangeAction({
    organizationId,
    projectId,
    targetId,
    afterDailyBudgetUsd: 120,
    requestedByUserId: ownerId,
  });
  return approveAutomationAction({ organizationId, projectId, actionId: proposed.id, approverId: ownerId });
}

/** Approves then executes a plain budget-change action against `target`, returning it in the `executed` state rollback expects. */
async function executedBudgetChangeAction(organizationId: string, projectId: string, targetId: string, ownerId: string) {
  const approved = await approvedBudgetChangeAction(organizationId, projectId, targetId, ownerId);
  return executeAutomationAction({ organizationId, projectId, actionId: approved.id, executedByUserId: ownerId });
}

/**
 * Directly persists an already-`executed` `campaign_activation` action against a target with no
 * `campaign_resource_name` — a state `proposeCampaignActivationAction` itself refuses to create
 * (it requires the target to already have a paused campaign, see the emulator test's "refuses to
 * propose an activation for a target with no campaign created yet"), so the only way to reach this
 * shape at all is a direct write, standing in for data corruption/a bypass of the normal propose
 * flow. Exercises `rollbackActionByType`'s own `InvalidAutomationActionError` guard, which (unlike
 * `execute/route.ts`'s sibling check) is not wrapped in a try/catch that would turn it into a
 * terminal `failed` status instead — see `rollbackAutomationAction` in `automation.service.ts`.
 */
async function executedCampaignActivationWithNoCampaignResourceName(
  organizationId: string,
  projectId: string,
  target: { id: string; label: string; environment_id: string },
  requestedByUserId: string,
) {
  const action = new AutomationActionModel();
  action.organization_id = organizationId;
  action.project_id = projectId;
  action.environment_id = target.environment_id;
  action.action_type = 'campaign_activation';
  action.target_id = target.id;
  action.target_label = target.label;
  action.before = { status: 'paused' };
  action.after = { status: 'enabled' };
  action.status = 'executed';
  action.guardrail_violations = [];
  action.requested_by_user_id = requestedByUserId;
  action.proposed_at = new Date().toISOString();
  action.executed_at = new Date().toISOString();
  action.setPathParams({ organization_id: organizationId, project_id: projectId });
  await action.save();
  return action;
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/automation/actions/[actionId]/rollback', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = rollbackRequest('org-1', 'project-1', 'action-1');
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold automation.execute (viewer)", async () => {
    const { owner, organization, project } = await setupOrgWithProject('Rollback Route Viewer Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    const executed = await executedBudgetChangeAction(organization.id, project.id, target.id, owner.id);

    const viewerEmail = uniqueEmail('viewer');
    const invitation = await inviteMemberToOrganization({
      organizationId: organization.id,
      email: viewerEmail,
      role: 'viewer',
      invitedByUserId: owner.id,
    });
    const viewerSession = await sessionFor(unique('uid'), viewerEmail);
    const viewer = await ensureUserForFirebaseSession({ firebaseUid: viewerSession.uid, email: viewerEmail });
    await acceptInvite({ organizationId: organization.id, membershipId: invitation.id, userId: viewer.id, callerEmailVerified: true });

    getServerSessionMock.mockResolvedValue(viewerSession);
    const { request, params } = rollbackRequest(organization.id, project.id, executed.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 404 for an action id that does not exist', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Rollback Route Missing Action Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = rollbackRequest(organization.id, project.id, 'does-not-exist');
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('returns 409 invalid_state for an action that has not been executed yet', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Rollback Route Invalid State Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    const approved = await approvedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = rollbackRequest(organization.id, project.id, approved.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'invalid_state' });
  });

  it('returns 409 google_ads_plugin_not_installed for a manage-tier Google Ads connection with the plugin not installed', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Rollback Route GAds Not Installed Org');
    const { target } = await seedTargetWithConnection(organization.id, project.id, owner.id, 'google_ads', 'manage');
    const approved = await approvedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = rollbackRequest(organization.id, project.id, approved.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'google_ads_plugin_not_installed' });
  });

  it('returns 409 google_ads_credential_not_configured with a reason once the plugin is installed but the vault is not configured', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Rollback Route GAds No Secret Org');
    const { target, attachment } = await seedTargetWithConnection(organization.id, project.id, owner.id, 'google_ads', 'manage');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: GOOGLE_ADS_MANAGE_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
    await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: GOOGLE_ADS_MANAGE_PLUGIN_ID,
      version: '1.0.0',
      consentedScopes: ['action:execute'],
      config: { [GOOGLE_ADS_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: attachment.id },
      installedByUserId: owner.id,
    });
    const approved = await approvedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const previousVaultKeys = process.env.GROWTHOS_VAULT_KEYS;
    delete process.env.GROWTHOS_VAULT_KEYS;
    try {
      const { request, params } = rollbackRequest(organization.id, project.id, approved.id);
      const response = await POST(request, { params });
      expect(response.status).toBe(409);
      const body = (await response.json()) as { error: string; reason: string };
      expect(body.error).toBe('google_ads_credential_not_configured');
      expect(body.reason).toBe('the vault is not configured on this deployment');
    } finally {
      process.env.GROWTHOS_VAULT_KEYS = previousVaultKeys;
    }
  });

  it('returns 409 meta_plugin_not_installed for a manage-tier Meta Ads connection with the plugin not installed', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Rollback Route Meta Not Installed Org');
    const { target } = await seedTargetWithConnection(organization.id, project.id, owner.id, 'meta_ads', 'manage');
    const approved = await approvedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = rollbackRequest(organization.id, project.id, approved.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'meta_plugin_not_installed' });
  });

  it('returns 409 meta_ads_credential_not_configured with a reason once the plugin is installed but the vault is not configured', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Rollback Route Meta No Secret Org');
    const { target, attachment } = await seedTargetWithConnection(organization.id, project.id, owner.id, 'meta_ads', 'manage');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: META_MANAGE_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
    await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: META_MANAGE_PLUGIN_ID,
      version: '1.0.0',
      consentedScopes: ['action:execute'],
      config: { [META_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: attachment.id },
      installedByUserId: owner.id,
    });
    const approved = await approvedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const previousVaultKeys = process.env.GROWTHOS_VAULT_KEYS;
    delete process.env.GROWTHOS_VAULT_KEYS;
    try {
      const { request, params } = rollbackRequest(organization.id, project.id, approved.id);
      const response = await POST(request, { params });
      expect(response.status).toBe(409);
      const body = (await response.json()) as { error: string; reason: string };
      expect(body.error).toBe('meta_ads_credential_not_configured');
      expect(body.reason).toBe('the vault is not configured on this deployment');
    } finally {
      process.env.GROWTHOS_VAULT_KEYS = previousVaultKeys;
    }
  });

  it('rolls back an executed action against the simulated executor and returns its resulting status', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Rollback Route Success Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 100);
    const executed = await executedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = rollbackRequest(organization.id, project.id, executed.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string; status: string };
    expect(body.id).toBe(executed.id);
    expect(body.status).toBe('rolled_back');
  });

  it('still rolls back a simulated (unlinked) target successfully when the vault is not configured — the best-effort KMS resolution does not break rollback for targets that never needed it', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Rollback Route No Vault Simulated Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 100);
    const executed = await executedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const previousVaultKeys = process.env.GROWTHOS_VAULT_KEYS;
    delete process.env.GROWTHOS_VAULT_KEYS;
    try {
      const { request, params } = rollbackRequest(organization.id, project.id, executed.id);
      const response = await POST(request, { params });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { status: string };
      expect(body.status).toBe('rolled_back');
    } finally {
      process.env.GROWTHOS_VAULT_KEYS = previousVaultKeys;
    }
  });

  it('returns 400 invalid_action for a campaign_activation action against a target with no campaign resource name to roll back', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Rollback Route Invalid Action Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    const action = await executedCampaignActivationWithNoCampaignResourceName(organization.id, project.id, target, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = rollbackRequest(organization.id, project.id, action.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_action' });
  });
});
