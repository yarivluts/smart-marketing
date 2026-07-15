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
  MetaAutomationActionExecutor,
  MetaAdsCredentialConfigError,
  MetaPluginNotInstalledError,
  META_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  META_MANAGE_PLUGIN_ID,
  META_MANAGE_PLUGIN_MANIFEST_YAML,
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

const VALID_META_ADS_SECRET = {
  accessToken: 'access-token',
  adAccountId: '1234567890',
  pageId: '9876543210',
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

describe('resolveAutomationActionExecutorForTarget (KAN-73, Meta)', () => {
  it('throws MetaPluginNotInstalledError for a Meta connection when the plugin is not installed', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Meta Resolver Not Installed Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Agency Meta Ads',
      provider: 'meta_ads',
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
      MetaPluginNotInstalledError,
    );
  });

  it('throws MetaAdsCredentialConfigError when the plugin is installed but the credential has no secret set', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Meta Resolver No Secret Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Agency Meta Ads',
      provider: 'meta_ads',
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
      MetaAdsCredentialConfigError,
    );
  });

  it('resolves a real MetaAutomationActionExecutor once the connection, plugin install, and secret are all in place', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Meta Resolver Full Setup Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Agency Meta Ads',
      provider: 'meta_ads',
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
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);
    await setSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, secret: JSON.stringify(VALID_META_ADS_SECRET), kms });

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
    expect(executor).toBeInstanceOf(MetaAutomationActionExecutor);
  });

  it('never resolves a Meta connection to a GoogleAdsAutomationActionExecutor, and vice versa (cross-provider isolation)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Cross Provider Isolation Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    await registerPluginManifest({ organizationId: organization.id, manifestYaml: GOOGLE_ADS_MANAGE_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: META_MANAGE_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });

    const googleCredential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Agency Google Ads',
      provider: 'google_ads',
      availableScopes: ['act_1'],
      createdByUserId: owner.id,
    });
    const googleAttachment = await requestResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'credential',
      resourceId: googleCredential.id,
      requestedByUserId: owner.id,
      scopeSelection: ['act_1'],
    });
    await decideResourceAttachment({ organizationId: organization.id, attachmentId: googleAttachment.id, decidedByUserId: owner.id, approve: true });
    await setResourceAttachmentWriteTier({ organizationId: organization.id, attachmentId: googleAttachment.id, tier: 'manage', actorId: owner.id });
    await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: GOOGLE_ADS_MANAGE_PLUGIN_ID,
      version: '1.0.0',
      consentedScopes: ['action:execute'],
      config: { [GOOGLE_ADS_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: googleAttachment.id },
      installedByUserId: owner.id,
    });
    await setSharedCredentialSecret({
      organizationId: organization.id,
      credentialId: googleCredential.id,
      secret: JSON.stringify(VALID_GOOGLE_ADS_SECRET),
      kms,
    });
    const googleTarget = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Google Target',
      initialDailyBudgetUsd: 100,
      seededByUserId: owner.id,
      resourceAttachmentId: googleAttachment.id,
    });

    const metaCredential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Agency Meta Ads',
      provider: 'meta_ads',
      availableScopes: ['act_1'],
      createdByUserId: owner.id,
    });
    const metaAttachment = await requestResourceAttachment({
      organizationId: organization.id,
      projectId: project.id,
      resourceKind: 'credential',
      resourceId: metaCredential.id,
      requestedByUserId: owner.id,
      scopeSelection: ['act_1'],
    });
    await decideResourceAttachment({ organizationId: organization.id, attachmentId: metaAttachment.id, decidedByUserId: owner.id, approve: true });
    await setResourceAttachmentWriteTier({ organizationId: organization.id, attachmentId: metaAttachment.id, tier: 'manage', actorId: owner.id });
    await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: META_MANAGE_PLUGIN_ID,
      version: '1.0.0',
      consentedScopes: ['action:execute'],
      config: { [META_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: metaAttachment.id },
      installedByUserId: owner.id,
    });
    await setSharedCredentialSecret({
      organizationId: organization.id,
      credentialId: metaCredential.id,
      secret: JSON.stringify(VALID_META_ADS_SECRET),
      kms,
    });
    const metaTarget = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId: unique('campaign'),
      targetType: 'campaign',
      label: 'Meta Target',
      initialDailyBudgetUsd: 100,
      seededByUserId: owner.id,
      resourceAttachmentId: metaAttachment.id,
    });

    const googleExecutor = await resolveAutomationActionExecutorForTarget(organization.id, project.id, googleTarget.id, kms);
    const metaExecutor = await resolveAutomationActionExecutorForTarget(organization.id, project.id, metaTarget.id, kms);

    expect(googleExecutor).toBeInstanceOf(GoogleAdsAutomationActionExecutor);
    expect(googleExecutor).not.toBeInstanceOf(MetaAutomationActionExecutor);
    expect(metaExecutor).toBeInstanceOf(MetaAutomationActionExecutor);
    expect(metaExecutor).not.toBeInstanceOf(GoogleAdsAutomationActionExecutor);
  });
});
