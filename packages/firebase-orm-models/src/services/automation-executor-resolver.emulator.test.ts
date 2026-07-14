import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  decideResourceAttachment,
  defaultAutomationActionExecutor,
  ensureAutomationTargetSeeded,
  ensureUserForFirebaseSession,
  GoogleAdsAutomationActionExecutor,
  GoogleAdsCredentialConfigError,
  GoogleAdsPluginNotInstalledError,
  GOOGLE_ADS_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  GOOGLE_ADS_MANAGE_PLUGIN_ID,
  GOOGLE_ADS_MANAGE_PLUGIN_MANIFEST_YAML,
  generateLocalKmsKeyRing,
  installPlugin,
  LocalKmsProvider,
  registerPluginManifest,
  requestResourceAttachment,
  resolveAutomationActionExecutorForTarget,
  setResourceAttachmentWriteTier,
  setSharedCredentialSecret,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('automation-executor-resolver-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupOrgWithProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, organization, project };
}

const VALID_GOOGLE_ADS_SECRET = {
  developerToken: 'dev-token',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  refreshToken: 'refresh-token',
  customerId: '1234567890',
};

describe('resolveAutomationActionExecutorForTarget (KAN-72)', () => {
  it('falls back to the simulated executor for a target with no linked connection', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Resolver No Connection Org');
    const target = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Summer Sale',
      initialDailyBudgetUsd: 100,
      seededByUserId: owner.id,
    });
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    const executor = await resolveAutomationActionExecutorForTarget(organization.id, project.id, target.id, kms);
    expect(executor).toBe(defaultAutomationActionExecutor);
  });

  it('falls back to the simulated executor for a connection whose credential is not a Google Ads credential', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Resolver Wrong Provider Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Stripe (test account)',
      provider: 'stripe',
      availableScopes: ['account'],
      createdByUserId: owner.id,
    });
    const attachment = await requestResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'credential',
      resourceId: credential.id,
      requestedByUserId: owner.id,
      scopeSelection: ['account'],
    });
    await decideResourceAttachment({ organizationId: organization.id, attachmentId: attachment.id, decidedByUserId: owner.id, approve: true });
    await setResourceAttachmentWriteTier({ organizationId: organization.id, attachmentId: attachment.id, tier: 'manage', actorId: owner.id });

    const target = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Summer Sale',
      initialDailyBudgetUsd: 100,
      seededByUserId: owner.id,
      resourceAttachmentId: attachment.id,
    });
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    const executor = await resolveAutomationActionExecutorForTarget(organization.id, project.id, target.id, kms);
    expect(executor).toBe(defaultAutomationActionExecutor);
  });

  it('throws GoogleAdsPluginNotInstalledError for a Google Ads connection when the plugin is not installed', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Resolver Not Installed Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Agency Google Ads',
      provider: 'google_ads',
      availableScopes: ['act_1'],
      createdByUserId: owner.id,
    });
    const attachment = await requestResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'credential',
      resourceId: credential.id,
      requestedByUserId: owner.id,
      scopeSelection: ['act_1'],
    });
    await decideResourceAttachment({ organizationId: organization.id, attachmentId: attachment.id, decidedByUserId: owner.id, approve: true });
    await setResourceAttachmentWriteTier({ organizationId: organization.id, attachmentId: attachment.id, tier: 'manage', actorId: owner.id });

    const target = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Summer Sale',
      initialDailyBudgetUsd: 100,
      seededByUserId: owner.id,
      resourceAttachmentId: attachment.id,
    });
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    await expect(resolveAutomationActionExecutorForTarget(organization.id, project.id, target.id, kms)).rejects.toThrow(
      GoogleAdsPluginNotInstalledError,
    );
  });

  it('throws GoogleAdsCredentialConfigError when the plugin is installed but the credential has no secret set', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Resolver No Secret Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Agency Google Ads',
      provider: 'google_ads',
      availableScopes: ['act_1'],
      createdByUserId: owner.id,
    });
    const attachment = await requestResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'credential',
      resourceId: credential.id,
      requestedByUserId: owner.id,
      scopeSelection: ['act_1'],
    });
    await decideResourceAttachment({ organizationId: organization.id, attachmentId: attachment.id, decidedByUserId: owner.id, approve: true });
    await setResourceAttachmentWriteTier({ organizationId: organization.id, attachmentId: attachment.id, tier: 'manage', actorId: owner.id });
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

    const target = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Summer Sale',
      initialDailyBudgetUsd: 100,
      seededByUserId: owner.id,
      resourceAttachmentId: attachment.id,
    });
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    await expect(resolveAutomationActionExecutorForTarget(organization.id, project.id, target.id, kms)).rejects.toThrow(
      GoogleAdsCredentialConfigError,
    );
  });

  it('resolves a real GoogleAdsAutomationActionExecutor once the connection, plugin install, and secret are all in place', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Resolver Full Setup Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Agency Google Ads',
      provider: 'google_ads',
      availableScopes: ['act_1'],
      createdByUserId: owner.id,
    });
    const attachment = await requestResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'credential',
      resourceId: credential.id,
      requestedByUserId: owner.id,
      scopeSelection: ['act_1'],
    });
    await decideResourceAttachment({ organizationId: organization.id, attachmentId: attachment.id, decidedByUserId: owner.id, approve: true });
    await setResourceAttachmentWriteTier({ organizationId: organization.id, attachmentId: attachment.id, tier: 'manage', actorId: owner.id });
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
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);
    await setSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, secret: JSON.stringify(VALID_GOOGLE_ADS_SECRET), kms });

    const target = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Summer Sale',
      initialDailyBudgetUsd: 100,
      seededByUserId: owner.id,
      resourceAttachmentId: attachment.id,
    });

    const executor = await resolveAutomationActionExecutorForTarget(organization.id, project.id, target.id, kms);
    expect(executor).toBeInstanceOf(GoogleAdsAutomationActionExecutor);
  });
});
