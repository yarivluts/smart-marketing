import 'reflect-metadata';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  createSegment,
  createSharedCredential,
  CrmWebhookCredentialConfigError,
  CRM_WEBHOOK_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  CRM_WEBHOOK_PLUGIN_ID,
  CRM_WEBHOOK_PLUGIN_MANIFEST_YAML,
  decideResourceAttachment,
  disablePlugin,
  ensureUserForFirebaseSession,
  generateLocalKmsKeyRing,
  GoogleCustomerMatchCredentialConfigError,
  GOOGLE_CUSTOMER_MATCH_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  GOOGLE_CUSTOMER_MATCH_NAME_CONFIG_FIELD,
  GOOGLE_CUSTOMER_MATCH_PLUGIN_ID,
  GOOGLE_CUSTOMER_MATCH_PLUGIN_MANIFEST_YAML,
  installPlugin,
  listActionPluginInstallsForProject,
  listAuditLogEntriesForOrg,
  listCrmSyncRunsForSegment,
  LocalKmsProvider,
  MetaAudienceCredentialConfigError,
  META_CUSTOM_AUDIENCE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  META_CUSTOM_AUDIENCE_NAME_CONFIG_FIELD,
  META_CUSTOM_AUDIENCE_PLUGIN_ID,
  META_CUSTOM_AUDIENCE_PLUGIN_MANIFEST_YAML,
  NotAnActionPluginError,
  PluginInstallModel,
  PluginInstallNotActiveError,
  PluginInstallNotFoundError,
  registerPluginManifest,
  registerSchemaDefinition,
  requestResourceAttachment,
  resolveCrmWebhookCredentialSecret,
  resolveGoogleCustomerMatchCredentialSecret,
  resolveMetaAudienceCredentialSecret,
  SegmentNotFoundError,
  setSharedCredentialSecret,
  syncSegmentToCrm,
  UnsupportedSinkPluginError,
  type SchemaFieldInput,
  type SinkPluginExecutor,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

const APP_NAME = 'crm-sync-tests';

beforeAll(async () => {
  await connectToFirestoreEmulator(APP_NAME);
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

const NO_SLEEP_RETRY = { maxAttempts: 3, baseDelayMs: 0, factor: 1, sleep: () => Promise.resolve() };

async function setupOrgWithProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, organization, project };
}

const customerFieldsV1: SchemaFieldInput[] = [
  { name: 'customer_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
  { name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
];

async function registerCustomerSchema(organizationId: string, projectId: string, createdByUserId: string) {
  return registerSchemaDefinition({ organizationId, projectId, kind: 'entity', name: 'customer', fields: customerFieldsV1, createdByUserId });
}

/** Sets up a fully-configured, installed CRM webhook plugin: a `generic`-provider credential with its secret set, approved-attached to the project, and the manifest installed pointing its config at that attachment. */
async function setupInstalledCrmWebhookPlugin(orgName: string, secret: { webhookUrl: string; bearerToken: string } = { webhookUrl: 'https://crm.example.com/hooks/growthos', bearerToken: 'tok_abc' }) {
  const { owner, organization, project } = await setupOrgWithProject(orgName);
  const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
  const kms = new LocalKmsProvider(keyRing, currentKeyId);

  const credential = await createSharedCredential({
    organizationId: organization.id,
    name: 'CRM webhook (test)',
    provider: 'generic',
    availableScopes: ['account'],
    createdByUserId: owner.id,
  });
  await setSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, secret: JSON.stringify(secret), kms, actorId: owner.id });

  const attachment = await requestResourceAttachment({
    organizationId: organization.id,
    projectId: project.id,
    resourceKind: 'credential',
    resourceId: credential.id,
    requestedByUserId: owner.id,
    scopeSelection: ['account'],
  });
  await decideResourceAttachment({ organizationId: organization.id, attachmentId: attachment.id, decidedByUserId: owner.id, approve: true });

  await registerPluginManifest({ organizationId: organization.id, manifestYaml: CRM_WEBHOOK_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
  const install = await installPlugin({
    organizationId: organization.id,
    projectId: project.id,
    pluginId: CRM_WEBHOOK_PLUGIN_ID,
    version: '1.0.0',
    consentedScopes: ['action:execute'],
    config: { [CRM_WEBHOOK_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: attachment.id },
    installedByUserId: owner.id,
  });

  return { owner, organization, project, credential, attachment, install, kms };
}

/** The Meta Custom Audience sibling of {@link setupInstalledCrmWebhookPlugin} — a `meta_ads`-provider credential with its secret set, approved-attached to the project, and the manifest installed pointing its config at that attachment plus a configured `audience_name`. */
async function setupInstalledMetaCustomAudiencePlugin(
  orgName: string,
  secret: { accessToken: string; adAccountId: string; pageId: string } = { accessToken: 'access-token-1', adAccountId: '999', pageId: 'page-1' },
  audienceName = 'Warm leads',
) {
  const { owner, organization, project } = await setupOrgWithProject(orgName);
  const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
  const kms = new LocalKmsProvider(keyRing, currentKeyId);

  const credential = await createSharedCredential({
    organizationId: organization.id,
    name: 'Meta Ads (test)',
    provider: 'meta_ads',
    availableScopes: ['account'],
    createdByUserId: owner.id,
  });
  await setSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, secret: JSON.stringify(secret), kms, actorId: owner.id });

  const attachment = await requestResourceAttachment({
    organizationId: organization.id,
    projectId: project.id,
    resourceKind: 'credential',
    resourceId: credential.id,
    requestedByUserId: owner.id,
    scopeSelection: ['account'],
  });
  await decideResourceAttachment({ organizationId: organization.id, attachmentId: attachment.id, decidedByUserId: owner.id, approve: true });

  await registerPluginManifest({ organizationId: organization.id, manifestYaml: META_CUSTOM_AUDIENCE_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
  const install = await installPlugin({
    organizationId: organization.id,
    projectId: project.id,
    pluginId: META_CUSTOM_AUDIENCE_PLUGIN_ID,
    version: '1.0.0',
    consentedScopes: ['action:execute'],
    config: { [META_CUSTOM_AUDIENCE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: attachment.id, [META_CUSTOM_AUDIENCE_NAME_CONFIG_FIELD]: audienceName },
    installedByUserId: owner.id,
  });

  return { owner, organization, project, credential, attachment, install, kms };
}

/** The Google Ads Customer Match sibling of {@link setupInstalledMetaCustomAudiencePlugin} — a `google_ads`-provider credential with its secret set, approved-attached to the project, and the manifest installed pointing its config at that attachment plus a configured `user_list_name`. */
async function setupInstalledGoogleCustomerMatchPlugin(
  orgName: string,
  secret: { developerToken: string; clientId: string; clientSecret: string; refreshToken: string; customerId: string } = {
    developerToken: 'dev-token',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    refreshToken: 'refresh-token',
    customerId: '1234567890',
  },
  userListName = 'Warm leads',
) {
  const { owner, organization, project } = await setupOrgWithProject(orgName);
  const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
  const kms = new LocalKmsProvider(keyRing, currentKeyId);

  const credential = await createSharedCredential({
    organizationId: organization.id,
    name: 'Google Ads (test)',
    provider: 'google_ads',
    availableScopes: ['account'],
    createdByUserId: owner.id,
  });
  await setSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, secret: JSON.stringify(secret), kms, actorId: owner.id });

  const attachment = await requestResourceAttachment({
    organizationId: organization.id,
    projectId: project.id,
    resourceKind: 'credential',
    resourceId: credential.id,
    requestedByUserId: owner.id,
    scopeSelection: ['account'],
  });
  await decideResourceAttachment({ organizationId: organization.id, attachmentId: attachment.id, decidedByUserId: owner.id, approve: true });

  await registerPluginManifest({ organizationId: organization.id, manifestYaml: GOOGLE_CUSTOMER_MATCH_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
  const install = await installPlugin({
    organizationId: organization.id,
    projectId: project.id,
    pluginId: GOOGLE_CUSTOMER_MATCH_PLUGIN_ID,
    version: '1.0.0',
    consentedScopes: ['action:execute'],
    config: { [GOOGLE_CUSTOMER_MATCH_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: attachment.id, [GOOGLE_CUSTOMER_MATCH_NAME_CONFIG_FIELD]: userListName },
    installedByUserId: owner.id,
  });

  return { owner, organization, project, credential, attachment, install, kms };
}

function fakeSinkExecutor(overrides: Partial<SinkPluginExecutor> = {}): SinkPluginExecutor {
  return {
    push: async (params) => ({ pushed: params.records.length }),
    ...overrides,
  };
}

describe('resolveCrmWebhookCredentialSecret', () => {
  it('resolves the real secret from an approved, configured attachment', async () => {
    const { organization, project, install, kms } = await setupInstalledCrmWebhookPlugin('Resolve Crm Secret Org');

    const secret = await resolveCrmWebhookCredentialSecret(organization.id, project.id, install, kms);

    expect(secret).toEqual({ webhookUrl: 'https://crm.example.com/hooks/growthos', bearerToken: 'tok_abc' });
  });

  it('rejects an install missing the credential-attachment config field', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Resolve Crm Secret No Config Org');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: CRM_WEBHOOK_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
    // installPlugin's own config_schema validation requires the field to be present — supply a
    // dangling id so the failure is caught in resolveCrmWebhookCredentialSecret itself, the same
    // "not at install time" posture stripe-plugin.emulator.test.ts's own equivalent test documents.
    const install = await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: CRM_WEBHOOK_PLUGIN_ID,
      version: '1.0.0',
      consentedScopes: ['action:execute'],
      config: { [CRM_WEBHOOK_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: 'nonexistent-attachment' },
      installedByUserId: owner.id,
    });
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    await expect(resolveCrmWebhookCredentialSecret(organization.id, project.id, install, kms)).rejects.toBeInstanceOf(CrmWebhookCredentialConfigError);
  });

  it('rejects a credential whose provider is not "generic"', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Resolve Crm Secret Wrong Provider Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);
    const credential = await createSharedCredential({ organizationId: organization.id, name: 'Stripe (wrong provider)', provider: 'stripe', availableScopes: ['account'], createdByUserId: owner.id });
    await setSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, secret: JSON.stringify({ apiSecretKey: 'sk_1', webhookSigningSecret: 'whsec_1' }), kms, actorId: owner.id });
    const attachment = await requestResourceAttachment({ organizationId: organization.id, projectId: project.id, resourceKind: 'credential', resourceId: credential.id, requestedByUserId: owner.id, scopeSelection: ['account'] });
    await decideResourceAttachment({ organizationId: organization.id, attachmentId: attachment.id, decidedByUserId: owner.id, approve: true });
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: CRM_WEBHOOK_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
    const install = await installPlugin({ organizationId: organization.id, projectId: project.id, pluginId: CRM_WEBHOOK_PLUGIN_ID, version: '1.0.0', consentedScopes: ['action:execute'], config: { [CRM_WEBHOOK_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: attachment.id }, installedByUserId: owner.id });

    await expect(resolveCrmWebhookCredentialSecret(organization.id, project.id, install, kms)).rejects.toBeInstanceOf(CrmWebhookCredentialConfigError);
  });

  it('rejects a credential with no secret set yet', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Resolve Crm Secret Unset Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);
    const credential = await createSharedCredential({ organizationId: organization.id, name: 'CRM webhook (no secret)', provider: 'generic', availableScopes: ['account'], createdByUserId: owner.id });
    const attachment = await requestResourceAttachment({ organizationId: organization.id, projectId: project.id, resourceKind: 'credential', resourceId: credential.id, requestedByUserId: owner.id, scopeSelection: ['account'] });
    await decideResourceAttachment({ organizationId: organization.id, attachmentId: attachment.id, decidedByUserId: owner.id, approve: true });
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: CRM_WEBHOOK_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
    const install = await installPlugin({ organizationId: organization.id, projectId: project.id, pluginId: CRM_WEBHOOK_PLUGIN_ID, version: '1.0.0', consentedScopes: ['action:execute'], config: { [CRM_WEBHOOK_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: attachment.id }, installedByUserId: owner.id });

    await expect(resolveCrmWebhookCredentialSecret(organization.id, project.id, install, kms)).rejects.toBeInstanceOf(CrmWebhookCredentialConfigError);
  });
});

describe('resolveMetaAudienceCredentialSecret', () => {
  it('resolves the real secret + configured audience name from an approved, configured attachment', async () => {
    const { organization, project, install, kms } = await setupInstalledMetaCustomAudiencePlugin('Resolve Meta Audience Secret Org');

    const secret = await resolveMetaAudienceCredentialSecret(organization.id, project.id, install, kms);

    expect(secret).toEqual({ accessToken: 'access-token-1', adAccountId: '999', audienceName: 'Warm leads' });
  });

  it('rejects an install missing the credential-attachment config field', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Resolve Meta Audience Secret No Config Org');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: META_CUSTOM_AUDIENCE_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
    const install = await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: META_CUSTOM_AUDIENCE_PLUGIN_ID,
      version: '1.0.0',
      consentedScopes: ['action:execute'],
      config: { [META_CUSTOM_AUDIENCE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: 'nonexistent-attachment', [META_CUSTOM_AUDIENCE_NAME_CONFIG_FIELD]: 'Warm leads' },
      installedByUserId: owner.id,
    });
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    await expect(resolveMetaAudienceCredentialSecret(organization.id, project.id, install, kms)).rejects.toBeInstanceOf(MetaAudienceCredentialConfigError);
  });

  it('rejects a credential whose provider is not "meta_ads"', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Resolve Meta Audience Secret Wrong Provider Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);
    const credential = await createSharedCredential({ organizationId: organization.id, name: 'Generic (wrong provider)', provider: 'generic', availableScopes: ['account'], createdByUserId: owner.id });
    await setSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, secret: JSON.stringify({ webhookUrl: 'https://x.example.com', bearerToken: 'tok' }), kms, actorId: owner.id });
    const attachment = await requestResourceAttachment({ organizationId: organization.id, projectId: project.id, resourceKind: 'credential', resourceId: credential.id, requestedByUserId: owner.id, scopeSelection: ['account'] });
    await decideResourceAttachment({ organizationId: organization.id, attachmentId: attachment.id, decidedByUserId: owner.id, approve: true });
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: META_CUSTOM_AUDIENCE_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
    const install = await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: META_CUSTOM_AUDIENCE_PLUGIN_ID,
      version: '1.0.0',
      consentedScopes: ['action:execute'],
      config: { [META_CUSTOM_AUDIENCE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: attachment.id, [META_CUSTOM_AUDIENCE_NAME_CONFIG_FIELD]: 'Warm leads' },
      installedByUserId: owner.id,
    });

    await expect(resolveMetaAudienceCredentialSecret(organization.id, project.id, install, kms)).rejects.toBeInstanceOf(MetaAudienceCredentialConfigError);
  });

  it('rejects an install missing the audience_name config field', async () => {
    const { owner, organization, project, attachment } = await setupInstalledMetaCustomAudiencePlugin('Resolve Meta Audience Secret No Name Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);
    // installPlugin's own config_schema validation requires the field to be present — build a
    // second install with a config that skips it directly against the model, mirroring
    // resolveCrmWebhookCredentialSecret's own "not at install time" test posture.
    const install = new PluginInstallModel();
    install.organization_id = organization.id;
    install.project_id = project.id;
    install.plugin_id = META_CUSTOM_AUDIENCE_PLUGIN_ID;
    install.version = '1.0.0';
    install.status = 'installed';
    install.granted_scopes = ['action:execute'];
    install.config = { [META_CUSTOM_AUDIENCE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: attachment.id };
    install.installed_by = owner.id;
    install.installed_at = new Date().toISOString();
    install.setPathParams({ organization_id: organization.id, project_id: project.id });
    await install.save();

    await expect(resolveMetaAudienceCredentialSecret(organization.id, project.id, install, kms)).rejects.toBeInstanceOf(MetaAudienceCredentialConfigError);
  });
});

describe('resolveGoogleCustomerMatchCredentialSecret', () => {
  it('resolves the real secret + configured user list name from an approved, configured attachment', async () => {
    const { organization, project, install, kms } = await setupInstalledGoogleCustomerMatchPlugin('Resolve Google Customer Match Secret Org');

    const secret = await resolveGoogleCustomerMatchCredentialSecret(organization.id, project.id, install, kms);

    expect(secret).toEqual({
      developerToken: 'dev-token',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token',
      customerId: '1234567890',
      userListName: 'Warm leads',
    });
  });

  it('rejects an install missing the credential-attachment config field', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Resolve Google Customer Match Secret No Config Org');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: GOOGLE_CUSTOMER_MATCH_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
    const install = await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: GOOGLE_CUSTOMER_MATCH_PLUGIN_ID,
      version: '1.0.0',
      consentedScopes: ['action:execute'],
      config: { [GOOGLE_CUSTOMER_MATCH_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: 'nonexistent-attachment', [GOOGLE_CUSTOMER_MATCH_NAME_CONFIG_FIELD]: 'Warm leads' },
      installedByUserId: owner.id,
    });
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    await expect(resolveGoogleCustomerMatchCredentialSecret(organization.id, project.id, install, kms)).rejects.toBeInstanceOf(GoogleCustomerMatchCredentialConfigError);
  });

  it('rejects a credential whose provider is not "google_ads"', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Resolve Google Customer Match Secret Wrong Provider Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);
    const credential = await createSharedCredential({ organizationId: organization.id, name: 'Generic (wrong provider)', provider: 'generic', availableScopes: ['account'], createdByUserId: owner.id });
    await setSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, secret: JSON.stringify({ webhookUrl: 'https://x.example.com', bearerToken: 'tok' }), kms, actorId: owner.id });
    const attachment = await requestResourceAttachment({ organizationId: organization.id, projectId: project.id, resourceKind: 'credential', resourceId: credential.id, requestedByUserId: owner.id, scopeSelection: ['account'] });
    await decideResourceAttachment({ organizationId: organization.id, attachmentId: attachment.id, decidedByUserId: owner.id, approve: true });
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: GOOGLE_CUSTOMER_MATCH_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
    const install = await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: GOOGLE_CUSTOMER_MATCH_PLUGIN_ID,
      version: '1.0.0',
      consentedScopes: ['action:execute'],
      config: { [GOOGLE_CUSTOMER_MATCH_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: attachment.id, [GOOGLE_CUSTOMER_MATCH_NAME_CONFIG_FIELD]: 'Warm leads' },
      installedByUserId: owner.id,
    });

    await expect(resolveGoogleCustomerMatchCredentialSecret(organization.id, project.id, install, kms)).rejects.toBeInstanceOf(GoogleCustomerMatchCredentialConfigError);
  });

  it('rejects an install missing the user_list_name config field', async () => {
    const { owner, organization, project, attachment } = await setupInstalledGoogleCustomerMatchPlugin('Resolve Google Customer Match Secret No Name Org');
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);
    // installPlugin's own config_schema validation requires the field to be present — build a
    // second install with a config that skips it directly against the model, mirroring
    // resolveMetaAudienceCredentialSecret's own "not at install time" test posture.
    const install = new PluginInstallModel();
    install.organization_id = organization.id;
    install.project_id = project.id;
    install.plugin_id = GOOGLE_CUSTOMER_MATCH_PLUGIN_ID;
    install.version = '1.0.0';
    install.status = 'installed';
    install.granted_scopes = ['action:execute'];
    install.config = { [GOOGLE_CUSTOMER_MATCH_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: attachment.id };
    install.installed_by = owner.id;
    install.installed_at = new Date().toISOString();
    install.setPathParams({ organization_id: organization.id, project_id: project.id });
    await install.save();

    await expect(resolveGoogleCustomerMatchCredentialSecret(organization.id, project.id, install, kms)).rejects.toBeInstanceOf(GoogleCustomerMatchCredentialConfigError);
  });
});

describe('syncSegmentToCrm', () => {
  it('pushes the segment’s matching members through the executor and records a succeeded run', async () => {
    const { owner, organization, project, install, kms } = await setupInstalledCrmWebhookPlugin('Sync Crm Success Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({ organizationId: organization.id, projectId: project.id, name: 'Pro customers', schemaName: 'customer', filters: [{ field: 'plan', op: '=', value: 'pro' }], createdByUserId: owner.id });
    const executor = fakeSinkExecutor();
    const membersExecutor = { execute: async () => [{ entity_id: 'cust_1', properties: JSON.stringify({ plan: 'pro' }), last_seen_at: '2026-08-20T00:00:00.000Z' }] };

    const run = await syncSegmentToCrm({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, installId: install.id, triggeredByUserId: owner.id, kms, executor, membersExecutor });

    expect(run.status).toBe('succeeded');
    expect(run.records_attempted).toBe(1);
    expect(run.records_pushed).toBe(1);
    expect(run.attempts).toBe(1);
    expect(run.segment_id).toBe(segment.id);
    expect(run.plugin_install_id).toBe(install.id);
    expect(run.triggered_by_user_id).toBe(owner.id);
  });

  it('records every attempt and succeeds once the executor recovers, per the configured retry/backoff', async () => {
    const { owner, organization, project, install, kms } = await setupInstalledCrmWebhookPlugin('Sync Crm Retry Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({ organizationId: organization.id, projectId: project.id, name: 'Pro customers', schemaName: 'customer', filters: [{ field: 'plan', op: '=', value: 'pro' }], createdByUserId: owner.id });
    let calls = 0;
    const executor = fakeSinkExecutor({
      push: async (params) => {
        calls += 1;
        if (calls === 1) {
          throw new Error('transient 502');
        }
        return { pushed: params.records.length };
      },
    });
    const membersExecutor = { execute: async () => [{ entity_id: 'cust_1', properties: JSON.stringify({ plan: 'pro' }), last_seen_at: '2026-08-20T00:00:00.000Z' }] };

    const run = await syncSegmentToCrm({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, installId: install.id, triggeredByUserId: owner.id, kms, executor, membersExecutor, retryOptions: NO_SLEEP_RETRY });

    expect(run.status).toBe('succeeded');
    expect(run.attempts).toBe(2);
    expect(run.records_pushed).toBe(1);
  });

  it('records a failed run with the error message once every retry is exhausted', async () => {
    const { owner, organization, project, install, kms } = await setupInstalledCrmWebhookPlugin('Sync Crm Exhausted Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({ organizationId: organization.id, projectId: project.id, name: 'Pro customers', schemaName: 'customer', filters: [{ field: 'plan', op: '=', value: 'pro' }], createdByUserId: owner.id });
    const executor = fakeSinkExecutor({ push: () => Promise.reject(new Error('CRM webhook request failed with status 502')) });
    const membersExecutor = { execute: async () => [{ entity_id: 'cust_1', properties: JSON.stringify({ plan: 'pro' }), last_seen_at: '2026-08-20T00:00:00.000Z' }] };

    const run = await syncSegmentToCrm({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, installId: install.id, triggeredByUserId: owner.id, kms, executor, membersExecutor, retryOptions: NO_SLEEP_RETRY });

    expect(run.status).toBe('failed');
    expect(run.records_attempted).toBe(1);
    expect(run.records_pushed).toBeUndefined();
    expect(run.error_message).toBe('CRM webhook request failed with status 502');
  });

  it('records a failed run (with no push attempted) when the segment’s member list is unavailable', async () => {
    const { owner, organization, project, install, kms } = await setupInstalledCrmWebhookPlugin('Sync Crm Members Unavailable Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({ organizationId: organization.id, projectId: project.id, name: 'Pro customers', schemaName: 'customer', filters: [{ field: 'plan', op: '=', value: 'pro' }], createdByUserId: owner.id });
    let pushed = false;
    const executor = fakeSinkExecutor({
      push: async (params) => {
        pushed = true;
        return { pushed: params.records.length };
      },
    });
    // No `membersExecutor` supplied — `listSegmentMembers` falls through to the real
    // `defaultWarehouseQueryExecutor`, which is unconfigured in this test environment.

    const run = await syncSegmentToCrm({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, installId: install.id, triggeredByUserId: owner.id, kms, executor });

    expect(run.status).toBe('failed');
    expect(run.records_attempted).toBe(0);
    expect(pushed).toBe(false);
  });

  it('writes an audit log entry for the sync', async () => {
    const { owner, organization, project, install, kms } = await setupInstalledCrmWebhookPlugin('Sync Crm Audit Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({ organizationId: organization.id, projectId: project.id, name: 'Pro customers', schemaName: 'customer', filters: [{ field: 'plan', op: '=', value: 'pro' }], createdByUserId: owner.id });
    const membersExecutor = { execute: async () => [] };

    await syncSegmentToCrm({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, installId: install.id, triggeredByUserId: owner.id, kms, executor: fakeSinkExecutor(), membersExecutor });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.some((entry) => entry.action === 'plugin_sink_run.trigger' && entry.target_id === segment.id)).toBe(true);
  });

  it('throws SegmentNotFoundError for a segment id that does not exist in this project, without creating a run', async () => {
    const { owner, organization, project, install, kms } = await setupInstalledCrmWebhookPlugin('Sync Crm Missing Segment Org');

    await expect(
      syncSegmentToCrm({ organizationId: organization.id, projectId: project.id, segmentId: 'nonexistent-segment', installId: install.id, triggeredByUserId: owner.id, kms }),
    ).rejects.toBeInstanceOf(SegmentNotFoundError);
  });

  it('throws PluginInstallNotFoundError for an install id that does not exist in this project', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Sync Crm Missing Install Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({ organizationId: organization.id, projectId: project.id, name: 'Pro customers', schemaName: 'customer', filters: [{ field: 'plan', op: '=', value: 'pro' }], createdByUserId: owner.id });
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    await expect(
      syncSegmentToCrm({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, installId: 'nonexistent-install', triggeredByUserId: owner.id, kms }),
    ).rejects.toBeInstanceOf(PluginInstallNotFoundError);
  });

  it('throws PluginInstallNotActiveError for a disabled install', async () => {
    const { owner, organization, project, install, kms } = await setupInstalledCrmWebhookPlugin('Sync Crm Disabled Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({ organizationId: organization.id, projectId: project.id, name: 'Pro customers', schemaName: 'customer', filters: [{ field: 'plan', op: '=', value: 'pro' }], createdByUserId: owner.id });
    await disablePlugin({ organizationId: organization.id, projectId: project.id, installId: install.id, performedByUserId: owner.id });

    await expect(
      syncSegmentToCrm({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, installId: install.id, triggeredByUserId: owner.id, kms }),
    ).rejects.toBeInstanceOf(PluginInstallNotActiveError);
  });

  it('throws NotAnActionPluginError for an install whose manifest type is not "action"', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Sync Crm Wrong Type Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({ organizationId: organization.id, projectId: project.id, name: 'Pro customers', schemaName: 'customer', filters: [{ field: 'plan', op: '=', value: 'pro' }], createdByUserId: owner.id });
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: 'id: com.example.toy-source\nversion: 1.0.0\ntype: source\ndisplay_name: Toy Source\nscopes: [ingest:write]\n', registeredByUserId: owner.id });
    const install = await installPlugin({ organizationId: organization.id, projectId: project.id, pluginId: 'com.example.toy-source', version: '1.0.0', consentedScopes: ['ingest:write'], config: {}, installedByUserId: owner.id });
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    await expect(
      syncSegmentToCrm({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, installId: install.id, triggeredByUserId: owner.id, kms }),
    ).rejects.toBeInstanceOf(NotAnActionPluginError);
  });

  it('throws UnsupportedSinkPluginError for an action-type install with no built-in executor', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Sync Crm Unsupported Plugin Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({ organizationId: organization.id, projectId: project.id, name: 'Pro customers', schemaName: 'customer', filters: [{ field: 'plan', op: '=', value: 'pro' }], createdByUserId: owner.id });
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: 'id: com.example.other-action\nversion: 1.0.0\ntype: action\ndisplay_name: Other Action\nscopes: [action:execute]\n', registeredByUserId: owner.id });
    const install = await installPlugin({ organizationId: organization.id, projectId: project.id, pluginId: 'com.example.other-action', version: '1.0.0', consentedScopes: ['action:execute'], config: {}, installedByUserId: owner.id });
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    await expect(
      syncSegmentToCrm({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, installId: install.id, triggeredByUserId: owner.id, kms }),
    ).rejects.toBeInstanceOf(UnsupportedSinkPluginError);
  });

  it('persists a connector-created externalRef (e.g. a new Meta Custom Audience id) onto the install after a successful sync', async () => {
    const { owner, organization, project, install, kms } = await setupInstalledMetaCustomAudiencePlugin('Sync Meta Audience Persist Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({ organizationId: organization.id, projectId: project.id, name: 'Pro customers', schemaName: 'customer', filters: [{ field: 'plan', op: '=', value: 'pro' }], createdByUserId: owner.id });
    const membersExecutor = { execute: async () => [{ entity_id: 'cust_1', properties: JSON.stringify({ plan: 'pro' }), last_seen_at: '2026-08-20T00:00:00.000Z' }] };
    const executor = fakeSinkExecutor({ push: async (params) => ({ pushed: params.records.length, externalRef: 'audience-abc' }) });

    expect(install.sink_external_ref).toBeUndefined();
    const run = await syncSegmentToCrm({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, installId: install.id, triggeredByUserId: owner.id, kms, executor, membersExecutor });

    expect(run.status).toBe('succeeded');
    const reloaded = await PluginInstallModel.init(install.id, { organization_id: organization.id, project_id: project.id });
    expect(reloaded?.sink_external_ref).toBe('audience-abc');
  });

  it('creates a Custom Audience on the first real sync and reuses the same one on the second, via the real dispatch (no executor override)', async () => {
    const { owner, organization, project, install, kms } = await setupInstalledMetaCustomAudiencePlugin('Sync Meta Audience Real Dispatch Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({ organizationId: organization.id, projectId: project.id, name: 'Pro customers', schemaName: 'customer', filters: [{ field: 'plan', op: '=', value: 'pro' }], createdByUserId: owner.id });
    const membersExecutor = { execute: async () => [{ entity_id: 'cust_1', properties: JSON.stringify({ plan: 'pro', email: 'a@example.com' }), last_seen_at: '2026-08-20T00:00:00.000Z' }] };

    const fetchMock = vi.fn(async (url: string) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/customaudiences')) {
        return { ok: true, status: 200, json: async () => ({ id: 'audience-real-1' }), text: async () => '{}' } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({ num_received: 1 }), text: async () => '{}' } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const firstRun = await syncSegmentToCrm({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, installId: install.id, triggeredByUserId: owner.id, kms, membersExecutor });
    expect(firstRun.status).toBe('succeeded');
    const afterFirstSync = await PluginInstallModel.init(install.id, { organization_id: organization.id, project_id: project.id });
    expect(afterFirstSync?.sink_external_ref).toBe('audience-real-1');
    const createAudienceCalls = fetchMock.mock.calls.filter(([url]) => new URL(String(url)).pathname.endsWith('/customaudiences'));
    expect(createAudienceCalls).toHaveLength(1);

    const secondRun = await syncSegmentToCrm({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, installId: install.id, triggeredByUserId: owner.id, kms, membersExecutor });
    expect(secondRun.status).toBe('succeeded');
    const afterSecondSync = await PluginInstallModel.init(install.id, { organization_id: organization.id, project_id: project.id });
    expect(afterSecondSync?.sink_external_ref).toBe('audience-real-1');
    // Still exactly one — the second sync reused the cached audience id instead of creating another.
    expect(fetchMock.mock.calls.filter(([url]) => new URL(String(url)).pathname.endsWith('/customaudiences'))).toHaveLength(1);
  });

  it('persists a connector-created externalRef (a new Google Ads Customer Match user list resource name) onto the install after a successful sync', async () => {
    const { owner, organization, project, install, kms } = await setupInstalledGoogleCustomerMatchPlugin('Sync Google Customer Match Persist Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({ organizationId: organization.id, projectId: project.id, name: 'Pro customers', schemaName: 'customer', filters: [{ field: 'plan', op: '=', value: 'pro' }], createdByUserId: owner.id });
    const membersExecutor = { execute: async () => [{ entity_id: 'cust_1', properties: JSON.stringify({ plan: 'pro' }), last_seen_at: '2026-08-20T00:00:00.000Z' }] };
    const executor = fakeSinkExecutor({ push: async (params) => ({ pushed: params.records.length, externalRef: 'customers/1234567890/userLists/abc' }) });

    expect(install.sink_external_ref).toBeUndefined();
    const run = await syncSegmentToCrm({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, installId: install.id, triggeredByUserId: owner.id, kms, executor, membersExecutor });

    expect(run.status).toBe('succeeded');
    const reloaded = await PluginInstallModel.init(install.id, { organization_id: organization.id, project_id: project.id });
    expect(reloaded?.sink_external_ref).toBe('customers/1234567890/userLists/abc');
  });

  it('creates a Customer Match user list on the first real sync and reuses the same one on the second, via the real dispatch (no executor override)', async () => {
    const { owner, organization, project, install, kms } = await setupInstalledGoogleCustomerMatchPlugin('Sync Google Customer Match Real Dispatch Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({ organizationId: organization.id, projectId: project.id, name: 'Pro customers', schemaName: 'customer', filters: [{ field: 'plan', op: '=', value: 'pro' }], createdByUserId: owner.id });
    const membersExecutor = { execute: async () => [{ entity_id: 'cust_1', properties: JSON.stringify({ plan: 'pro', email: 'a@example.com' }), last_seen_at: '2026-08-20T00:00:00.000Z' }] };

    const fetchMock = vi.fn(async (url: string) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/token') {
        return { ok: true, status: 200, json: async () => ({ access_token: 'access-token-1', expires_in: 3600 }), text: async () => '{}' } as unknown as Response;
      }
      if (parsed.pathname.endsWith('/userLists:mutate')) {
        return { ok: true, status: 200, json: async () => ({ results: [{ resourceName: 'customers/1234567890/userLists/real-1' }] }), text: async () => '{}' } as unknown as Response;
      }
      if (parsed.pathname.endsWith('/offlineUserDataJobs:create')) {
        return { ok: true, status: 200, json: async () => ({ resourceName: 'customers/1234567890/offlineUserDataJobs/real-job-1' }), text: async () => '{}' } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const firstRun = await syncSegmentToCrm({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, installId: install.id, triggeredByUserId: owner.id, kms, membersExecutor });
    expect(firstRun.status).toBe('succeeded');
    const afterFirstSync = await PluginInstallModel.init(install.id, { organization_id: organization.id, project_id: project.id });
    expect(afterFirstSync?.sink_external_ref).toBe('customers/1234567890/userLists/real-1');
    const createListCalls = fetchMock.mock.calls.filter(([url]) => new URL(String(url)).pathname.endsWith('/userLists:mutate'));
    expect(createListCalls).toHaveLength(1);

    const secondRun = await syncSegmentToCrm({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, installId: install.id, triggeredByUserId: owner.id, kms, membersExecutor });
    expect(secondRun.status).toBe('succeeded');
    const afterSecondSync = await PluginInstallModel.init(install.id, { organization_id: organization.id, project_id: project.id });
    expect(afterSecondSync?.sink_external_ref).toBe('customers/1234567890/userLists/real-1');
    // Still exactly one — the second sync reused the cached user list resource name instead of creating another.
    expect(fetchMock.mock.calls.filter(([url]) => new URL(String(url)).pathname.endsWith('/userLists:mutate'))).toHaveLength(1);
  });
});

describe('listCrmSyncRunsForSegment', () => {
  it('lists a segment’s own sync runs newest-first, isolated from a sibling segment', async () => {
    const { owner, organization, project, install, kms } = await setupInstalledCrmWebhookPlugin('List Crm Runs Org');
    await registerCustomerSchema(organization.id, project.id, owner.id);
    const segment = await createSegment({ organizationId: organization.id, projectId: project.id, name: 'Pro customers', schemaName: 'customer', filters: [{ field: 'plan', op: '=', value: 'pro' }], createdByUserId: owner.id });
    const otherSegment = await createSegment({ organizationId: organization.id, projectId: project.id, name: 'Enterprise customers', schemaName: 'customer', filters: [{ field: 'plan', op: '=', value: 'enterprise' }], createdByUserId: owner.id });
    const membersExecutor = { execute: async () => [] };

    const first = await syncSegmentToCrm({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, installId: install.id, triggeredByUserId: owner.id, kms, executor: fakeSinkExecutor(), membersExecutor });
    const second = await syncSegmentToCrm({ organizationId: organization.id, projectId: project.id, segmentId: segment.id, installId: install.id, triggeredByUserId: owner.id, kms, executor: fakeSinkExecutor(), membersExecutor });
    await syncSegmentToCrm({ organizationId: organization.id, projectId: project.id, segmentId: otherSegment.id, installId: install.id, triggeredByUserId: owner.id, kms, executor: fakeSinkExecutor(), membersExecutor });

    const runs = await listCrmSyncRunsForSegment(organization.id, project.id, segment.id);
    expect(runs.map((run) => run.id)).toEqual([second.id, first.id]);
    expect(runs.every((run) => run.segment_id === segment.id)).toBe(true);
  });
});

describe('listActionPluginInstallsForProject', () => {
  it('returns only currently-installed, action-type plugin installs', async () => {
    const { owner, organization, project, install: actionInstall } = await setupInstalledCrmWebhookPlugin('List Action Installs Org');

    // A source-type install in the same project — must never appear in an "action" listing.
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: 'id: com.example.toy-source\nversion: 1.0.0\ntype: source\ndisplay_name: Toy Source\nscopes: [ingest:write]\n', registeredByUserId: owner.id });
    await installPlugin({ organizationId: organization.id, projectId: project.id, pluginId: 'com.example.toy-source', version: '1.0.0', consentedScopes: ['ingest:write'], config: {}, installedByUserId: owner.id });

    // A second, distinct action-type plugin (installPlugin rejects a second install of the *same*
    // plugin id in one project) — installed then disabled, so it must be excluded too.
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: 'id: com.example.other-action\nversion: 1.0.0\ntype: action\ndisplay_name: Other Action\nscopes: [action:execute]\n', registeredByUserId: owner.id });
    const disabledActionInstall = await installPlugin({ organizationId: organization.id, projectId: project.id, pluginId: 'com.example.other-action', version: '1.0.0', consentedScopes: ['action:execute'], config: {}, installedByUserId: owner.id });
    await disablePlugin({ organizationId: organization.id, projectId: project.id, installId: disabledActionInstall.id, performedByUserId: owner.id });

    const installs = await listActionPluginInstallsForProject(organization.id, project.id);

    expect(installs.map((install) => install.id)).toEqual([actionInstall.id]);
    expect(installs.map((install) => install.id)).not.toContain(disabledActionInstall.id);
  });
});
