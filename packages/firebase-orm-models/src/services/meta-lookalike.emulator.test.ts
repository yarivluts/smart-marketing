import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  decideResourceAttachment,
  disablePlugin,
  ensureUserForFirebaseSession,
  generateLocalKmsKeyRing,
  installPlugin,
  listAuditLogEntriesForOrg,
  LocalKmsProvider,
  createMetaLookalikeAudience,
  listMetaLookalikeAudiencesForInstall,
  InvalidMetaLookalikeAudienceRequestError,
  MetaLookalikeAudienceCreationFailedError,
  MetaLookalikeSeedAudienceNotReadyError,
  NotMetaCustomAudiencePluginError,
  META_CUSTOM_AUDIENCE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  META_CUSTOM_AUDIENCE_NAME_CONFIG_FIELD,
  META_CUSTOM_AUDIENCE_PLUGIN_ID,
  META_CUSTOM_AUDIENCE_PLUGIN_MANIFEST_YAML,
  MetaAdsApiError,
  PluginInstallModel,
  PluginInstallNotActiveError,
  PluginInstallNotFoundError,
  ProjectNotFoundError,
  registerPluginManifest,
  requestResourceAttachment,
  setSharedCredentialSecret,
  type MetaAdsApiClient,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

const APP_NAME = 'meta-lookalike-tests';

beforeAll(async () => {
  await connectToFirestoreEmulator(APP_NAME);
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

/**
 * Sets up a fully-configured, installed Meta Custom Audience plugin — same shape as
 * `crm-sync.emulator.test.ts`'s own `setupInstalledMetaCustomAudiencePlugin` — optionally already
 * carrying a `sink_external_ref` seed audience id (as if a prior `syncSegmentToCrm` call already
 * succeeded), since `createMetaLookalikeAudience` requires one.
 */
async function setupInstalledMetaCustomAudiencePlugin(
  orgName: string,
  options: { seedAudienceId?: string } = {},
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
  let install = await installPlugin({
    organizationId: organization.id,
    projectId: project.id,
    pluginId: META_CUSTOM_AUDIENCE_PLUGIN_ID,
    version: '1.0.0',
    consentedScopes: ['action:execute'],
    config: { [META_CUSTOM_AUDIENCE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: attachment.id, [META_CUSTOM_AUDIENCE_NAME_CONFIG_FIELD]: audienceName },
    installedByUserId: owner.id,
  });

  if (options.seedAudienceId) {
    install.sink_external_ref = options.seedAudienceId;
    await install.save();
    install = (await PluginInstallModel.init(install.id, { organization_id: organization.id, project_id: project.id })) ?? install;
  }

  return { owner, organization, project, credential, attachment, install, kms };
}

function fakeApiClient(overrides: Partial<MetaAdsApiClient> = {}): MetaAdsApiClient {
  return {
    createCampaign: async () => ({ campaignId: 'unused' }),
    createAdSet: async () => ({ adSetId: 'unused' }),
    createAdCreative: async () => ({ creativeId: 'unused' }),
    uploadAdImage: async () => ({ imageHash: 'unused' }),
    createAd: async () => ({ adId: 'unused' }),
    getAd: async () => ({ adId: 'unused', creativeId: 'unused' }),
    updateAd: async () => undefined,
    setDailyBudgetCents: async () => undefined,
    setObjectStatus: async () => undefined,
    getCampaign: async () => ({ campaignId: 'unused' }),
    getCampaignState: async () => ({ campaignId: 'unused', status: 'PAUSED', dailyBudgetCents: null }),
    getAdSet: async () => ({ adSetId: 'unused', status: 'PAUSED', targeting: { countries: ['US'], ageMin: 18, ageMax: 65 } }),
    updateAdSet: async () => undefined,
    createCustomAudience: async () => ({ audienceId: 'unused' }),
    addContactsToCustomAudience: async () => ({ numReceived: 0 }),
    createLookalikeAudience: async () => ({ audienceId: 'audience-lookalike-fake' }),
    ...overrides,
  };
}

describe('createMetaLookalikeAudience', () => {
  it('creates a Lookalike Audience seeded from the install’s own Custom Audience and persists it', async () => {
    const { owner, organization, project, install, kms } = await setupInstalledMetaCustomAudiencePlugin('Lookalike Create Org', { seedAudienceId: 'audience-seed-1' });
    let capturedAdAccountId: string | undefined;
    let capturedParams: unknown;
    const apiClient = fakeApiClient({
      createLookalikeAudience: async (adAccountId, params) => {
        capturedAdAccountId = adAccountId;
        capturedParams = params;
        return { audienceId: 'audience-lookalike-1' };
      },
    });

    const audience = await createMetaLookalikeAudience({
      organizationId: organization.id,
      projectId: project.id,
      installId: install.id,
      name: 'Warm leads - Lookalike 5%',
      country: 'US',
      ratio: 0.05,
      createdByUserId: owner.id,
      kms,
      apiClient,
    });

    expect(capturedAdAccountId).toBe('999');
    expect(capturedParams).toEqual({ name: 'Warm leads - Lookalike 5%', originAudienceId: 'audience-seed-1', country: 'US', ratio: 0.05 });
    expect(audience.audience_id).toBe('audience-lookalike-1');
    expect(audience.origin_audience_id).toBe('audience-seed-1');
    expect(audience.plugin_install_id).toBe(install.id);
    expect(audience.created_by_user_id).toBe(owner.id);

    const listed = await listMetaLookalikeAudiencesForInstall(organization.id, project.id, install.id);
    expect(listed.map((entry) => entry.id)).toEqual([audience.id]);
  });

  it('writes an audit log entry for the creation', async () => {
    const { owner, organization, project, install, kms } = await setupInstalledMetaCustomAudiencePlugin('Lookalike Audit Org', { seedAudienceId: 'audience-seed-1' });
    const apiClient = fakeApiClient({ createLookalikeAudience: async () => ({ audienceId: 'audience-lookalike-2' }) });

    await createMetaLookalikeAudience({ organizationId: organization.id, projectId: project.id, installId: install.id, name: 'Lookalike', country: 'US', ratio: 0.05, createdByUserId: owner.id, kms, apiClient });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.some((entry) => entry.action === 'meta_lookalike_audience.create' && entry.target_id === install.id)).toBe(true);
  });

  it('rejects a name/country/ratio that fails validation, without calling the API client', async () => {
    const { owner, organization, project, install, kms } = await setupInstalledMetaCustomAudiencePlugin('Lookalike Invalid Org', { seedAudienceId: 'audience-seed-1' });
    let called = false;
    const apiClient = fakeApiClient({ createLookalikeAudience: async () => { called = true; return { audienceId: 'x' }; } });

    await expect(
      createMetaLookalikeAudience({ organizationId: organization.id, projectId: project.id, installId: install.id, name: '  ', country: 'usa', ratio: 0.5, createdByUserId: owner.id, kms, apiClient }),
    ).rejects.toBeInstanceOf(InvalidMetaLookalikeAudienceRequestError);
    expect(called).toBe(false);
  });

  it('throws MetaLookalikeSeedAudienceNotReadyError when the install has never synced (no seed audience yet)', async () => {
    const { owner, organization, project, install, kms } = await setupInstalledMetaCustomAudiencePlugin('Lookalike No Seed Org');

    await expect(
      createMetaLookalikeAudience({ organizationId: organization.id, projectId: project.id, installId: install.id, name: 'Lookalike', country: 'US', ratio: 0.05, createdByUserId: owner.id, kms }),
    ).rejects.toBeInstanceOf(MetaLookalikeSeedAudienceNotReadyError);
  });

  it('throws PluginInstallNotFoundError for an install id that does not exist in this project', async () => {
    const { owner, organization, project, kms } = await setupOrgWithProject('Lookalike Missing Install Org');

    await expect(
      createMetaLookalikeAudience({ organizationId: organization.id, projectId: project.id, installId: 'nonexistent-install', name: 'Lookalike', country: 'US', ratio: 0.05, createdByUserId: owner.id, kms }),
    ).rejects.toBeInstanceOf(PluginInstallNotFoundError);
  });

  it('throws ProjectNotFoundError for a project id that does not exist in this org', async () => {
    const { owner, organization, kms } = await setupOrgWithProject('Lookalike Missing Project Org');

    await expect(
      createMetaLookalikeAudience({ organizationId: organization.id, projectId: 'nonexistent-project', installId: 'whatever', name: 'Lookalike', country: 'US', ratio: 0.05, createdByUserId: owner.id, kms }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it('throws PluginInstallNotActiveError for a disabled install', async () => {
    const { owner, organization, project, install, kms } = await setupInstalledMetaCustomAudiencePlugin('Lookalike Disabled Org', { seedAudienceId: 'audience-seed-1' });
    await disablePlugin({ organizationId: organization.id, projectId: project.id, installId: install.id, performedByUserId: owner.id });

    await expect(
      createMetaLookalikeAudience({ organizationId: organization.id, projectId: project.id, installId: install.id, name: 'Lookalike', country: 'US', ratio: 0.05, createdByUserId: owner.id, kms }),
    ).rejects.toBeInstanceOf(PluginInstallNotActiveError);
  });

  it('throws NotMetaCustomAudiencePluginError for an install of a different plugin', async () => {
    const { owner, organization, project, kms } = await setupOrgWithProject('Lookalike Wrong Plugin Org');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: 'id: com.example.other-action\nversion: 1.0.0\ntype: action\ndisplay_name: Other Action\nscopes: [action:execute]\n', registeredByUserId: owner.id });
    const install = await installPlugin({ organizationId: organization.id, projectId: project.id, pluginId: 'com.example.other-action', version: '1.0.0', consentedScopes: ['action:execute'], config: {}, installedByUserId: owner.id });

    await expect(
      createMetaLookalikeAudience({ organizationId: organization.id, projectId: project.id, installId: install.id, name: 'Lookalike', country: 'US', ratio: 0.05, createdByUserId: owner.id, kms }),
    ).rejects.toBeInstanceOf(NotMetaCustomAudiencePluginError);
  });

  it('wraps a Meta API failure in MetaLookalikeAudienceCreationFailedError', async () => {
    const { owner, organization, project, install, kms } = await setupInstalledMetaCustomAudiencePlugin('Lookalike Api Failure Org', { seedAudienceId: 'audience-seed-1' });
    const apiClient = fakeApiClient({ createLookalikeAudience: async () => { throw new MetaAdsApiError('Meta Graph API request failed with status 400', 400); } });

    await expect(
      createMetaLookalikeAudience({ organizationId: organization.id, projectId: project.id, installId: install.id, name: 'Lookalike', country: 'US', ratio: 0.05, createdByUserId: owner.id, kms, apiClient }),
    ).rejects.toBeInstanceOf(MetaLookalikeAudienceCreationFailedError);
  });
});

describe('listMetaLookalikeAudiencesForInstall', () => {
  it('lists an install’s own Lookalike Audiences newest-first, isolated from a sibling install', async () => {
    const { owner, organization, project, install, kms } = await setupInstalledMetaCustomAudiencePlugin('Lookalike List Org', { seedAudienceId: 'audience-seed-1' });
    const { organization: otherOrganization, project: otherProject, install: otherInstall, kms: otherKms } = await setupInstalledMetaCustomAudiencePlugin('Lookalike List Other Org', { seedAudienceId: 'audience-seed-2' });

    const first = await createMetaLookalikeAudience({
      organizationId: organization.id,
      projectId: project.id,
      installId: install.id,
      name: 'First',
      country: 'US',
      ratio: 0.05,
      createdByUserId: owner.id,
      kms,
      apiClient: fakeApiClient({ createLookalikeAudience: async () => ({ audienceId: 'audience-lookalike-first' }) }),
    });
    const second = await createMetaLookalikeAudience({
      organizationId: organization.id,
      projectId: project.id,
      installId: install.id,
      name: 'Second',
      country: 'US',
      ratio: 0.1,
      createdByUserId: owner.id,
      kms,
      apiClient: fakeApiClient({ createLookalikeAudience: async () => ({ audienceId: 'audience-lookalike-second' }) }),
    });
    await createMetaLookalikeAudience({
      organizationId: otherOrganization.id,
      projectId: otherProject.id,
      installId: otherInstall.id,
      name: 'Other install',
      country: 'US',
      ratio: 0.05,
      createdByUserId: owner.id,
      kms: otherKms,
      apiClient: fakeApiClient({ createLookalikeAudience: async () => ({ audienceId: 'audience-lookalike-other' }) }),
    });

    const listed = await listMetaLookalikeAudiencesForInstall(organization.id, project.id, install.id);
    expect(listed.map((entry) => entry.id)).toEqual([second.id, first.id]);
  });
});
