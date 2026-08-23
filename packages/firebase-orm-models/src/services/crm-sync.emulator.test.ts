import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
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
  installPlugin,
  listActionPluginInstallsForProject,
  listAuditLogEntriesForOrg,
  listCrmSyncRunsForSegment,
  LocalKmsProvider,
  NotAnActionPluginError,
  PluginInstallNotActiveError,
  PluginInstallNotFoundError,
  registerPluginManifest,
  registerSchemaDefinition,
  requestResourceAttachment,
  resolveCrmWebhookCredentialSecret,
  SegmentNotFoundError,
  setSharedCredentialSecret,
  syncSegmentToCrm,
  type SchemaFieldInput,
  type SinkPluginExecutor,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

const APP_NAME = 'crm-sync-tests';

beforeAll(async () => {
  await connectToFirestoreEmulator(APP_NAME);
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
