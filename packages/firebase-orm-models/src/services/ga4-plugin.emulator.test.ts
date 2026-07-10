import 'reflect-metadata';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  DuplicateSchemaDefinitionError,
  ensureGa4SchemasRegistered,
  ensureUserForFirebaseSession,
  GA4_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  GA4_PLUGIN_ID,
  GA4_PLUGIN_MANIFEST_YAML,
  GA4_PROPERTY_ID_CONFIG_FIELD,
  Ga4CredentialConfigError,
  Ga4SourcePluginExecutor,
  generateLocalKmsKeyRing,
  getActiveSchemaDefinition,
  getMostRecentRawRecordForSchema,
  installPlugin,
  LocalKmsProvider,
  registerPluginManifest,
  requestResourceAttachment,
  decideResourceAttachment,
  runSourcePluginInstall,
  setSharedCredentialSecret,
  triggerSourcePluginRun,
  type Ga4ApiClient,
  type Ga4RunReportParams,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for KAN-52's GA4 plugin: schema auto-registration
 * and a full backfill sync landing session/event report rows through the
 * exact same runtime KAN-47 built — mirroring `stripe-plugin.emulator.test.ts`
 * (KAN-49) for this connector's own shape.
 */

const APP_NAME = 'ga4-plugin-tests';

beforeAll(async () => {
  await connectToFirestoreEmulator(APP_NAME);
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

const EMPTY_REPORT = { dimensionHeaders: [], metricHeaders: [], rows: [] };

function fakeGa4Client(overrides: Partial<Ga4ApiClient> = {}): Ga4ApiClient {
  return {
    runReport: async () => EMPTY_REPORT,
    ...overrides,
  };
}

async function setupOrgWithProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const environment = environments.find((e) => e.name === 'dev')!;
  return { owner, organization, project, environment };
}

/** Sets up a fully-configured, installed GA4 plugin: a GA4-provider credential with its secret set, approved-attached to the project, and the manifest installed pointing its config at that attachment + a property id. */
async function setupInstalledGa4Plugin(orgName: string, secret: { accessToken: string } = { accessToken: 'ya29.test' }) {
  const { owner, organization, project, environment } = await setupOrgWithProject(orgName);
  const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
  const kms = new LocalKmsProvider(keyRing, currentKeyId);

  const credential = await createSharedCredential({
    organizationId: organization.id,
    name: 'GA4 (test property)',
    provider: 'ga4',
    availableScopes: ['property'],
    createdByUserId: owner.id,
  });
  await setSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, secret: JSON.stringify(secret), kms });

  const attachment = await requestResourceAttachment({
    organizationId: organization.id,
    projectId: project.id,
    resourceKind: 'credential',
    resourceId: credential.id,
    requestedByUserId: owner.id,
    scopeSelection: ['property'],
  });
  await decideResourceAttachment({ organizationId: organization.id, attachmentId: attachment.id, decidedByUserId: owner.id, approve: true });

  await registerPluginManifest({ organizationId: organization.id, manifestYaml: GA4_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
  const install = await installPlugin({
    organizationId: organization.id,
    projectId: project.id,
    pluginId: GA4_PLUGIN_ID,
    version: '1.0.0',
    consentedScopes: ['ingest:write', 'schema:write'],
    config: { [GA4_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: attachment.id, [GA4_PROPERTY_ID_CONFIG_FIELD]: 'properties/123' },
    installedByUserId: owner.id,
  });

  return { owner, organization, project, environment, credential, attachment, install, kms };
}

describe('ensureGa4SchemasRegistered', () => {
  it('registers both ga4_session and ga4_event schemas', async () => {
    const { owner, organization, project } = await setupOrgWithProject('GA4 Schemas Org');
    await ensureGa4SchemasRegistered(organization.id, project.id, owner.id);

    const session = await getActiveSchemaDefinition(organization.id, project.id, 'event', 'ga4_session');
    const event = await getActiveSchemaDefinition(organization.id, project.id, 'event', 'ga4_event');

    expect(session).not.toBeNull();
    expect(event).not.toBeNull();
    expect(session!.field_defs.map((f) => f.name)).toContain('sessions');
  });

  it('is idempotent — calling it twice never throws DuplicateSchemaDefinitionError', async () => {
    const { owner, organization, project } = await setupOrgWithProject('GA4 Schemas Idempotent Org');
    await ensureGa4SchemasRegistered(organization.id, project.id, owner.id);
    await expect(ensureGa4SchemasRegistered(organization.id, project.id, owner.id)).resolves.not.toThrow(DuplicateSchemaDefinitionError);

    const versions = await getActiveSchemaDefinition(organization.id, project.id, 'event', 'ga4_session');
    expect(versions!.version).toBe(1);
  });
});

describe('a full GA4 backfill sync', () => {
  it('lands sessions and events report rows in one run', async () => {
    const { owner, organization, project, environment, install } = await setupInstalledGa4Plugin('GA4 Sync Org');
    await ensureGa4SchemasRegistered(organization.id, project.id, owner.id);

    const sessionsReport = {
      dimensionHeaders: [{ name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'sessionCampaignName' }, { name: 'sessionDefaultChannelGroup' }],
      metricHeaders: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'newUsers' }, { name: 'totalUsers' }],
      rows: [{ dimensionValues: [{ value: 'google' }, { value: 'cpc' }, { value: 'summer' }, { value: 'Paid Search' }], metricValues: [{ value: '10' }, { value: '8' }, { value: '3' }, { value: '9' }] }],
    };
    const eventsReport = {
      dimensionHeaders: [{ name: 'eventName' }, { name: 'sessionDefaultChannelGroup' }],
      metricHeaders: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      rows: [{ dimensionValues: [{ value: 'purchase' }, { value: 'Direct' }], metricValues: [{ value: '4' }, { value: '3' }] }],
    };

    const executor = new Ga4SourcePluginExecutor({
      apiClient: fakeGa4Client({
        runReport: async (params: Ga4RunReportParams) => (params.dimensions.includes('eventName') ? eventsReport : sessionsReport),
      }),
      propertyId: 'properties/123',
    });

    const run = await triggerSourcePluginRun({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
      installId: install.id,
      triggeredByUserId: owner.id,
      executor,
    });

    expect(run.status).toBe('succeeded');
    expect(run.records_accepted).toBe(2);
    expect(run.records_quarantined).toBe(0);

    const landedSession = await getMostRecentRawRecordForSchema(organization.id, project.id, 'event', 'ga4_session');
    expect(landedSession).not.toBeNull();
    expect((landedSession!.payload.properties as Record<string, unknown>).source).toBe('google');

    const landedEvent = await getMostRecentRawRecordForSchema(organization.id, project.id, 'event', 'ga4_event');
    expect(landedEvent).not.toBeNull();
    expect((landedEvent!.payload.properties as Record<string, unknown>).event_name).toBe('purchase');
  });

  it('honestly quarantines a landed record when its schema was never registered', async () => {
    const { owner, organization, project, environment, install } = await setupInstalledGa4Plugin('GA4 Unregistered Schema Org');
    const executor = new Ga4SourcePluginExecutor({
      apiClient: fakeGa4Client({
        runReport: async (params: Ga4RunReportParams) =>
          params.dimensions.includes('eventName')
            ? EMPTY_REPORT
            : {
                dimensionHeaders: [{ name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'sessionCampaignName' }, { name: 'sessionDefaultChannelGroup' }],
                metricHeaders: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'newUsers' }, { name: 'totalUsers' }],
                rows: [{ dimensionValues: [{ value: 'google' }, { value: 'cpc' }, { value: '' }, { value: 'Paid Search' }], metricValues: [{ value: '1' }, { value: '1' }, { value: '1' }, { value: '1' }] }],
              },
      }),
      propertyId: 'properties/123',
    });

    const run = await triggerSourcePluginRun({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
      installId: install.id,
      triggeredByUserId: owner.id,
      executor,
    });

    expect(run.status).toBe('succeeded');
    expect(run.records_accepted).toBe(0);
    expect(run.records_quarantined).toBe(1);
  });
});

describe('runSourcePluginInstall (GA4 branch)', () => {
  it('rejects a "Run now" for a GA4 install with no configured credential attachment, before ever building an executor', async () => {
    const { owner, organization, project, environment } = await setupOrgWithProject('Run GA4 Unconfigured Org');
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
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    await expect(
      runSourcePluginInstall({ organizationId: organization.id, projectId: project.id, environmentId: environment.id, installId: install.id, triggeredByUserId: owner.id, kms }),
    ).rejects.toBeInstanceOf(Ga4CredentialConfigError);
  });

  it('rejects a "Run now" for a configured GA4 install when no KMS provider is supplied', async () => {
    const { owner, organization, project, environment, install } = await setupInstalledGa4Plugin('Run GA4 No Kms Org');

    await expect(
      runSourcePluginInstall({ organizationId: organization.id, projectId: project.id, environmentId: environment.id, installId: install.id, triggeredByUserId: owner.id }),
    ).rejects.toBeInstanceOf(Ga4CredentialConfigError);
  });

  it('runs the built-in GA4 plugin end to end via the generic dispatch, building a real Ga4HttpApiClient against the resolved property/token', async () => {
    const { owner, organization, project, environment, install, kms } = await setupInstalledGa4Plugin('Run GA4 End To End Org');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ dimensionHeaders: [], metricHeaders: [], rows: [] }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    try {
      const run = await runSourcePluginInstall({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: environment.id,
        installId: install.id,
        triggeredByUserId: owner.id,
        kms,
      });

      expect(run.status).toBe('succeeded');
      expect(run.record_kind).toBe('event');
      expect(fetchMock).toHaveBeenCalledWith('https://analyticsdata.googleapis.com/v1beta/properties/123:runReport', expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer ya29.test' }),
      }));

      const session = await getActiveSchemaDefinition(organization.id, project.id, 'event', 'ga4_session');
      expect(session).not.toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
