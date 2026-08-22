import { randomBytes } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  acceptInvite,
  approveAutomationAction,
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  decideResourceAttachment,
  engageAutomationKillSwitch,
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

/** The route always parses a JSON body (even to just discover no guarded metric was sent), so every request needs a valid body — default to `{}`, same as omitting `guardedMetricBefore`/`guardedMetricAfter` entirely. */
function verifyRequest(
  orgId: string,
  projectId: string,
  actionId: string,
  body: unknown = {},
): { request: NextRequest; params: Promise<{ orgId: string; projectId: string; actionId: string }> } {
  return {
    request: new NextRequest(
      `https://growthos.test/api/orgs/${orgId}/projects/${projectId}/automation/actions/${actionId}/verify`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
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

/** Mirrors `rollback/route.test.ts`'s own helper: seeds an approved credential connection at the given write tier and a target linked to it. */
async function seedTargetWithConnection(
  organizationId: string,
  projectId: string,
  ownerId: string,
  provider: 'google_ads' | 'meta_ads',
  tier: 'read' | 'optimize' | 'manage',
) {
  const credentialNames: Record<typeof provider, string> = {
    google_ads: 'Agency Google Ads MCC',
    meta_ads: 'Agency Meta Ads',
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

/** Approves then executes a plain budget-change action against `target`, returning it in the `executed` state verify expects. */
async function executedBudgetChangeAction(organizationId: string, projectId: string, targetId: string, ownerId: string) {
  const approved = await approvedBudgetChangeAction(organizationId, projectId, targetId, ownerId);
  return executeAutomationAction({ organizationId, projectId, actionId: approved.id, executedByUserId: ownerId });
}

describe('POST /api/orgs/[orgId]/projects/[projectId]/automation/actions/[actionId]/verify', () => {
  it('rejects an unauthenticated caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const { request, params } = verifyRequest('org-1', 'project-1', 'action-1');
    const response = await POST(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects a member whose role doesn't hold automation.execute (viewer)", async () => {
    const { owner, organization, project } = await setupOrgWithProject('Verify Route Viewer Org');
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
    const { request, params } = verifyRequest(organization.id, project.id, executed.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(403);
  });

  it('returns 404 for an action id that does not exist', async () => {
    const { ownerSession, organization, project } = await setupOrgWithProject('Verify Route Missing Action Org');
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = verifyRequest(organization.id, project.id, 'does-not-exist');
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('returns 409 invalid_state for an action that has not been executed yet', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Verify Route Invalid State Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    const approved = await approvedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = verifyRequest(organization.id, project.id, approved.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'invalid_state' });
  });

  it('returns 400 invalid_guarded_metric when guardedMetricBefore/After are not numbers', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Verify Route Bad Metric Type Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    const executed = await executedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = verifyRequest(organization.id, project.id, executed.id, { guardedMetricBefore: 'not-a-number' });
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_guarded_metric' });
  });

  it('returns 400 invalid_action when a guarded metric overflows to a non-finite number (valid JSON, invalid semantics)', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Verify Route Non Finite Metric Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    const executed = await executedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    // `1e400` is a syntactically valid JSON number literal that overflows to `Infinity` once
    // parsed — passes the route's own `typeof === 'number'` check but fails the service's
    // `Number.isFinite` check, so this exercises `InvalidAutomationActionError` specifically.
    // Built as a raw request body (rather than through `JSON.stringify`, which would collapse
    // an in-memory `Infinity` value to `null` before it ever reached the wire).
    const request = new NextRequest(
      `https://growthos.test/api/orgs/${organization.id}/projects/${project.id}/automation/actions/${executed.id}/verify`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"guardedMetricBefore":1e400,"guardedMetricAfter":90}',
      },
    );
    const response = await POST(request, { params: Promise.resolve({ orgId: organization.id, projectId: project.id, actionId: executed.id }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_action' });
  });

  it('returns 409 google_ads_plugin_not_installed for a manage-tier Google Ads connection with the plugin not installed', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Verify Route GAds Not Installed Org');
    const { target } = await seedTargetWithConnection(organization.id, project.id, owner.id, 'google_ads', 'manage');
    const approved = await approvedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = verifyRequest(organization.id, project.id, approved.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'google_ads_plugin_not_installed' });
  });

  it('returns 409 google_ads_credential_not_configured with a reason once the plugin is installed but the vault is not configured', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Verify Route GAds No Secret Org');
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
      const { request, params } = verifyRequest(organization.id, project.id, approved.id);
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
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Verify Route Meta Not Installed Org');
    const { target } = await seedTargetWithConnection(organization.id, project.id, owner.id, 'meta_ads', 'manage');
    const approved = await approvedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = verifyRequest(organization.id, project.id, approved.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'meta_plugin_not_installed' });
  });

  it('returns 409 meta_ads_credential_not_configured with a reason once the plugin is installed but the vault is not configured', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Verify Route Meta No Secret Org');
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
      const { request, params } = verifyRequest(organization.id, project.id, approved.id);
      const response = await POST(request, { params });
      expect(response.status).toBe(409);
      const body = (await response.json()) as { error: string; reason: string };
      expect(body.error).toBe('meta_ads_credential_not_configured');
      expect(body.reason).toBe('the vault is not configured on this deployment');
    } finally {
      process.env.GROWTHOS_VAULT_KEYS = previousVaultKeys;
    }
  });

  it('verifies an executed action with no guarded metric supplied and returns its resulting status', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Verify Route Success No Metric Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 100);
    const executed = await executedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = verifyRequest(organization.id, project.id, executed.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string; status: string; guardedMetricRegressionPct: number | undefined };
    expect(body.id).toBe(executed.id);
    expect(body.status).toBe('verified');
    expect(body.guardedMetricRegressionPct).toBeUndefined();
  });

  it('verifies an executed action whose guarded metric regressed under the default 20% threshold, recording the regression pct', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Verify Route Success Under Threshold Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 100);
    const executed = await executedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = verifyRequest(organization.id, project.id, executed.id, {
      guardedMetricBefore: 100,
      guardedMetricAfter: 90,
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string; status: string; guardedMetricRegressionPct: number };
    expect(body.id).toBe(executed.id);
    expect(body.status).toBe('verified');
    expect(body.guardedMetricRegressionPct).toBeCloseTo(10);
  });

  it('auto-rolls back a guarded metric regression past the default 20% threshold against the simulated executor', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Verify Route Auto Rollback Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 100);
    const executed = await executedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = verifyRequest(organization.id, project.id, executed.id, {
      guardedMetricBefore: 100,
      guardedMetricAfter: 70,
    });
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string; status: string; guardedMetricRegressionPct: number };
    expect(body.id).toBe(executed.id);
    expect(body.status).toBe('rolled_back');
    expect(body.guardedMetricRegressionPct).toBeCloseTo(30);
  });

  it('verifies an executed action even while the org kill switch is engaged — unlike execute/approve, verify has no kill-switch gate', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Verify Route No Kill Switch Gate Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 100);
    const executed = await executedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    await engageAutomationKillSwitch({ organizationId: organization.id, reason: 'incident drill', actorId: owner.id });
    getServerSessionMock.mockResolvedValue(ownerSession);

    const { request, params } = verifyRequest(organization.id, project.id, executed.id);
    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe('verified');
  });

  it('still verifies a simulated (unlinked) target successfully when the vault is not configured — the best-effort KMS resolution does not break verify for targets that never needed it', async () => {
    const { ownerSession, owner, organization, project } = await setupOrgWithProject('Verify Route No Vault Simulated Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 100);
    const executed = await executedBudgetChangeAction(organization.id, project.id, target.id, owner.id);
    getServerSessionMock.mockResolvedValue(ownerSession);

    const previousVaultKeys = process.env.GROWTHOS_VAULT_KEYS;
    delete process.env.GROWTHOS_VAULT_KEYS;
    try {
      const { request, params } = verifyRequest(organization.id, project.id, executed.id);
      const response = await POST(request, { params });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { status: string };
      expect(body.status).toBe('verified');
    } finally {
      process.env.GROWTHOS_VAULT_KEYS = previousVaultKeys;
    }
  });
});
