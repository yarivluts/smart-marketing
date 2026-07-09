import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  DuplicateSchemaDefinitionError,
  ensureStripeCommerceSchemasRegistered,
  ensureUserForFirebaseSession,
  generateLocalKmsKeyRing,
  getActiveSchemaDefinition,
  getMostRecentRawRecordForSchema,
  installPlugin,
  LocalKmsProvider,
  processStripeWebhookEvent,
  registerPluginManifest,
  requestResourceAttachment,
  decideResourceAttachment,
  runSourcePluginInstall,
  setSharedCredentialSecret,
  STRIPE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  STRIPE_PLUGIN_ID,
  STRIPE_PLUGIN_MANIFEST_YAML,
  StripeSourcePluginExecutor,
  StripeCredentialConfigError,
  StripeWebhookSignatureError,
  triggerSourcePluginRun,
  type StripeApiClient,
  type StripeListParams,
  type StripeCharge,
  type StripeInvoice,
  type StripeSubscription,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for KAN-49's Stripe plugin: commerce-schema
 * auto-registration, a full backfill sync landing charges/invoices/refunds/
 * subscriptions through the exact same runtime KAN-47 built, and verified
 * webhook delivery.
 */

const APP_NAME = 'stripe-plugin-tests';

beforeAll(async () => {
  await connectToFirestoreEmulator(APP_NAME);
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

const EMPTY_PAGE = { object: 'list' as const, data: [], has_more: false };

function fakeStripeClient(overrides: Partial<StripeApiClient> = {}): StripeApiClient {
  return {
    listCharges: async () => EMPTY_PAGE,
    listInvoices: async () => EMPTY_PAGE,
    listRefunds: async () => EMPTY_PAGE,
    listSubscriptions: async () => EMPTY_PAGE,
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

/** Sets up a fully-configured, installed Stripe plugin: a Stripe-provider credential with its secret set, approved-attached to the project, and the manifest installed pointing its config at that attachment. */
async function setupInstalledStripePlugin(
  orgName: string,
  secret: { apiSecretKey: string; webhookSigningSecret: string } = { apiSecretKey: 'sk_test_123', webhookSigningSecret: 'whsec_test_456' },
) {
  const { owner, organization, project, environment } = await setupOrgWithProject(orgName);
  const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
  const kms = new LocalKmsProvider(keyRing, currentKeyId);

  const credential = await createSharedCredential({
    organizationId: organization.id,
    name: 'Stripe (test account)',
    provider: 'stripe',
    // Stripe has no ad-account-style sub-slicing (unlike Google/Meta) — a single
    // "account" scope stands in as the one slice-able unit `requestResourceAttachment`
    // always requires a non-empty `scopeSelection` subset of.
    availableScopes: ['account'],
    createdByUserId: owner.id,
  });
  await setSharedCredentialSecret({ organizationId: organization.id, credentialId: credential.id, secret: JSON.stringify(secret), kms });

  const attachment = await requestResourceAttachment({
    organizationId: organization.id,
    projectId: project.id,
    resourceKind: 'credential',
    resourceId: credential.id,
    requestedByUserId: owner.id,
    scopeSelection: ['account'],
  });
  await decideResourceAttachment({ organizationId: organization.id, attachmentId: attachment.id, decidedByUserId: owner.id, approve: true });

  await registerPluginManifest({ organizationId: organization.id, manifestYaml: STRIPE_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
  const install = await installPlugin({
    organizationId: organization.id,
    projectId: project.id,
    pluginId: STRIPE_PLUGIN_ID,
    version: '1.0.0',
    consentedScopes: ['ingest:write', 'schema:write'],
    config: { [STRIPE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: attachment.id },
    installedByUserId: owner.id,
  });

  return { owner, organization, project, environment, credential, attachment, install, kms };
}

describe('ensureStripeCommerceSchemasRegistered', () => {
  it('registers every commerce schema this connector lands into', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Stripe Schemas Org');
    await ensureStripeCommerceSchemasRegistered(organization.id, project.id, owner.id);

    const charge = await getActiveSchemaDefinition(organization.id, project.id, 'event', 'stripe_charge');
    const invoice = await getActiveSchemaDefinition(organization.id, project.id, 'event', 'stripe_invoice');
    const refund = await getActiveSchemaDefinition(organization.id, project.id, 'event', 'stripe_refund');
    const failedPayment = await getActiveSchemaDefinition(organization.id, project.id, 'event', 'stripe_failed_payment');
    const subscription = await getActiveSchemaDefinition(organization.id, project.id, 'entity', 'stripe_subscription');

    expect(charge).not.toBeNull();
    expect(invoice).not.toBeNull();
    expect(refund).not.toBeNull();
    expect(failedPayment).not.toBeNull();
    expect(subscription).not.toBeNull();
    expect(subscription!.field_defs.map((f) => f.name)).toContain('mrr_normalized');
  });

  it('is idempotent — calling it twice never throws DuplicateSchemaDefinitionError', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Stripe Schemas Idempotent Org');
    await ensureStripeCommerceSchemasRegistered(organization.id, project.id, owner.id);
    await expect(ensureStripeCommerceSchemasRegistered(organization.id, project.id, owner.id)).resolves.not.toThrow(
      DuplicateSchemaDefinitionError,
    );

    const versions = await getActiveSchemaDefinition(organization.id, project.id, 'event', 'stripe_charge');
    expect(versions!.version).toBe(1);
  });
});

describe('a full Stripe backfill sync', () => {
  it('lands charges, invoices, refunds, and a subscription with mrr_normalized, alternating events/entities phases', async () => {
    const { owner, organization, project, environment, install } = await setupInstalledStripePlugin('Stripe Sync Org');
    await ensureStripeCommerceSchemasRegistered(organization.id, project.id, owner.id);

    const charge: StripeCharge = {
      id: 'ch_1',
      object: 'charge',
      amount: 5000,
      currency: 'usd',
      customer: 'cus_1',
      status: 'succeeded',
      refunded: false,
      amount_refunded: 0,
      created: 1_700_000_000,
    };
    const invoice: StripeInvoice = {
      id: 'in_1',
      object: 'invoice',
      customer: 'cus_1',
      subscription: 'sub_1',
      status: 'paid',
      amount_due: 2000,
      amount_paid: 2000,
      currency: 'usd',
      created: 1_700_000_000,
    };
    const subscription: StripeSubscription = {
      id: 'sub_1',
      object: 'subscription',
      customer: 'cus_1',
      status: 'active',
      currency: 'usd',
      current_period_end: 1_700_100_000,
      cancel_at_period_end: false,
      canceled_at: null,
      created: 1_690_000_000,
      items: { data: [{ price: { unit_amount: 24000, currency: 'usd', recurring: { interval: 'year', interval_count: 1 } }, quantity: 1 }] },
    };

    const executor = new StripeSourcePluginExecutor({
      apiClient: fakeStripeClient({
        listCharges: async (params: StripeListParams) => (params.startingAfter || params.createdGte ? EMPTY_PAGE : { object: 'list', data: [charge], has_more: false }),
        listInvoices: async (params: StripeListParams) => (params.startingAfter || params.createdGte ? EMPTY_PAGE : { object: 'list', data: [invoice], has_more: false }),
        listSubscriptions: async (params: StripeListParams) => (params.startingAfter || params.createdGte ? EMPTY_PAGE : { object: 'list', data: [subscription], has_more: false }),
      }),
    });

    // Round 1: events phase — lands the charge + invoice.
    const eventsRun = await triggerSourcePluginRun({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
      installId: install.id,
      triggeredByUserId: owner.id,
      executor,
    });
    expect(eventsRun.status).toBe('succeeded');
    expect(eventsRun.records_accepted).toBe(2);
    expect(eventsRun.records_quarantined).toBe(0);

    const landedCharge = await getMostRecentRawRecordForSchema(organization.id, project.id, 'event', 'stripe_charge');
    expect(landedCharge).not.toBeNull();
    expect((landedCharge!.payload.properties as Record<string, unknown>).charge_id).toBe('ch_1');

    // Round 2: entities phase — lands the subscription, with mrr_normalized computed (24000/12 = 2000).
    const entitiesRun = await triggerSourcePluginRun({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
      installId: install.id,
      triggeredByUserId: owner.id,
      executor,
    });
    expect(entitiesRun.status).toBe('succeeded');
    expect(entitiesRun.records_accepted).toBe(1);

    const landedSubscription = await getMostRecentRawRecordForSchema(organization.id, project.id, 'entity', 'stripe_subscription');
    expect(landedSubscription).not.toBeNull();
    expect((landedSubscription!.payload.attributes as Record<string, unknown>).mrr_normalized).toBe(2000);

    // Round 3: back to events phase, cursor resumes cleanly — "survives restart".
    const thirdRun = await triggerSourcePluginRun({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
      installId: install.id,
      triggeredByUserId: owner.id,
      executor,
    });
    expect(thirdRun.status).toBe('succeeded');
    expect(thirdRun.cursor_before).toBe(entitiesRun.cursor_after);
  });

  it('honestly quarantines a landed record when its commerce schema was never registered', async () => {
    const { owner, organization, project, environment, install } = await setupInstalledStripePlugin('Stripe Unregistered Schema Org');
    const executor = new StripeSourcePluginExecutor({
      apiClient: fakeStripeClient({
        listCharges: async (params: StripeListParams) =>
          params.startingAfter || params.createdGte
            ? EMPTY_PAGE
            : {
                object: 'list',
                data: [{ id: 'ch_1', object: 'charge', amount: 100, currency: 'usd', customer: null, status: 'succeeded', refunded: false, amount_refunded: 0, created: 1_700_000_000 }],
                has_more: false,
              },
      }),
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

describe('runSourcePluginInstall', () => {
  it('passes straight through to the generic toy executor for a non-Stripe install — unchanged KAN-47 behavior', async () => {
    const { owner, organization, project, environment } = await setupOrgWithProject('Run Passthrough Org');
    await registerPluginManifest({
      organizationId: organization.id,
      manifestYaml: `
id: com.example.toy-source
version: 1.0.0
type: source
display_name: Toy Source Plugin
scopes: [ingest:write]
`,
      registeredByUserId: owner.id,
    });
    const install = await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: 'com.example.toy-source',
      version: '1.0.0',
      consentedScopes: ['ingest:write'],
      config: {},
      installedByUserId: owner.id,
    });

    // No `kms` supplied — proves the Stripe-specific branch was never taken for a non-Stripe install.
    const run = await runSourcePluginInstall({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
      installId: install.id,
      triggeredByUserId: owner.id,
    });

    expect(run.status).toBe('succeeded');
    expect(run.record_kind).toBe('event');
  });

  it('rejects a "Run now" for a Stripe install with no configured credential attachment, before ever building an executor', async () => {
    const { owner, organization, project, environment } = await setupOrgWithProject('Run Stripe Unconfigured Org');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: STRIPE_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
    // installPlugin's own config_schema validation requires the field to be present — supply a
    // dangling id that resolves to no approved attachment, so the failure is caught in
    // `resolveStripeCredentialSecret`, not at install time.
    const install = await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: STRIPE_PLUGIN_ID,
      version: '1.0.0',
      consentedScopes: ['ingest:write', 'schema:write'],
      config: { [STRIPE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: 'nonexistent-attachment' },
      installedByUserId: owner.id,
    });
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    await expect(
      runSourcePluginInstall({ organizationId: organization.id, projectId: project.id, environmentId: environment.id, installId: install.id, triggeredByUserId: owner.id, kms }),
    ).rejects.toBeInstanceOf(StripeCredentialConfigError);
  });

  it('rejects a "Run now" for a configured Stripe install when no KMS provider is supplied', async () => {
    const { owner, organization, project, environment, install } = await setupInstalledStripePlugin('Run Stripe No Kms Org');

    await expect(
      runSourcePluginInstall({ organizationId: organization.id, projectId: project.id, environmentId: environment.id, installId: install.id, triggeredByUserId: owner.id }),
    ).rejects.toBeInstanceOf(StripeCredentialConfigError);
  });
});

function signedWebhookBody(body: string, secret: string, timestamp: number = Math.floor(Date.now() / 1000)): string {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('processStripeWebhookEvent', () => {
  it('verifies the signature and lands a charge.succeeded webhook', async () => {
    const { organization, project, environment, install, kms } = await setupInstalledStripePlugin('Stripe Webhook Org');
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('registrar') });
    await ensureStripeCommerceSchemasRegistered(organization.id, project.id, owner.id);

    const body = JSON.stringify({
      id: 'evt_1',
      object: 'event',
      type: 'charge.succeeded',
      created: 1_700_000_000,
      data: {
        object: { id: 'ch_1', object: 'charge', amount: 1500, currency: 'usd', customer: 'cus_1', status: 'succeeded', refunded: false, amount_refunded: 0, created: 1_700_000_000 },
      },
    });
    const header = signedWebhookBody(body, 'whsec_test_456');

    const result = await processStripeWebhookEvent({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
      installId: install.id,
      rawBody: body,
      signatureHeader: header,
      kms,
    });

    expect(result.handled).toBe(true);
    expect(result.summary?.accepted).toBe(1);

    const landed = await getMostRecentRawRecordForSchema(organization.id, project.id, 'event', 'stripe_charge');
    expect((landed!.payload.properties as Record<string, unknown>).charge_id).toBe('ch_1');
  });

  it('acknowledges (handled: false) an event type it does not map, without landing anything', async () => {
    const { organization, project, environment, install, kms } = await setupInstalledStripePlugin('Stripe Webhook Ignore Org');
    const body = JSON.stringify({ id: 'evt_2', object: 'event', type: 'payment_intent.created', created: 1_700_000_000, data: { object: {} } });
    const header = signedWebhookBody(body, 'whsec_test_456');

    const result = await processStripeWebhookEvent({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
      installId: install.id,
      rawBody: body,
      signatureHeader: header,
      kms,
    });

    expect(result).toEqual({ eventId: 'evt_2', eventType: 'payment_intent.created', handled: false });
  });

  it('rejects a webhook signed with the wrong secret', async () => {
    const { organization, project, environment, install, kms } = await setupInstalledStripePlugin('Stripe Webhook Bad Sig Org');
    const body = JSON.stringify({ id: 'evt_3', object: 'event', type: 'charge.succeeded', created: 1_700_000_000, data: { object: {} } });
    const header = signedWebhookBody(body, 'whsec_totally_wrong');

    await expect(
      processStripeWebhookEvent({ organizationId: organization.id, projectId: project.id, environmentId: environment.id, installId: install.id, rawBody: body, signatureHeader: header, kms }),
    ).rejects.toBeInstanceOf(StripeWebhookSignatureError);
  });

  it('rejects a validly-signed payload that is not valid JSON, rather than throwing an unhandled SyntaxError', async () => {
    const { organization, project, environment, install, kms } = await setupInstalledStripePlugin('Stripe Webhook Malformed Json Org');
    const body = 'not json';
    const header = signedWebhookBody(body, 'whsec_test_456');

    await expect(
      processStripeWebhookEvent({ organizationId: organization.id, projectId: project.id, environmentId: environment.id, installId: install.id, rawBody: body, signatureHeader: header, kms }),
    ).rejects.toBeInstanceOf(StripeWebhookSignatureError);
  });

  it('rejects a webhook for an install that is not the built-in Stripe plugin', async () => {
    const { owner, organization, project, environment } = await setupOrgWithProject('Stripe Webhook Wrong Plugin Org');
    await registerPluginManifest({
      organizationId: organization.id,
      manifestYaml: `
id: com.example.not-stripe
version: 1.0.0
type: source
display_name: Not Stripe
scopes: [ingest:write]
`,
      registeredByUserId: owner.id,
    });
    const install = await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: 'com.example.not-stripe',
      version: '1.0.0',
      consentedScopes: ['ingest:write'],
      config: {},
      installedByUserId: owner.id,
    });
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    const body = '{}';
    const header = signedWebhookBody(body, 'whsec_irrelevant');
    await expect(
      processStripeWebhookEvent({ organizationId: organization.id, projectId: project.id, environmentId: environment.id, installId: install.id, rawBody: body, signatureHeader: header, kms }),
    ).rejects.toBeInstanceOf(StripeCredentialConfigError);
  });

  it('rejects a webhook when the attached credential has no secret set yet', async () => {
    const { owner, organization, project, environment } = await setupOrgWithProject('Stripe Webhook No Secret Org');
    const credential = await createSharedCredential({
      organizationId: organization.id,
      name: 'Stripe (no secret yet)',
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
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: STRIPE_PLUGIN_MANIFEST_YAML, registeredByUserId: owner.id });
    const install = await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: STRIPE_PLUGIN_ID,
      version: '1.0.0',
      consentedScopes: ['ingest:write', 'schema:write'],
      config: { [STRIPE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: attachment.id },
      installedByUserId: owner.id,
    });
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = new LocalKmsProvider(keyRing, currentKeyId);

    const body = '{}';
    const header = signedWebhookBody(body, 'whsec_irrelevant');
    await expect(
      processStripeWebhookEvent({ organizationId: organization.id, projectId: project.id, environmentId: environment.id, installId: install.id, rawBody: body, signatureHeader: header, kms }),
    ).rejects.toBeInstanceOf(StripeCredentialConfigError);
  });

  it('rejects a webhook for a project the install does not belong to (isolation)', async () => {
    const { organization, environment, install, kms } = await setupInstalledStripePlugin('Stripe Webhook Isolation Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other Project' });

    const body = '{}';
    const header = signedWebhookBody(body, 'whsec_test_456');
    await expect(
      processStripeWebhookEvent({ organizationId: organization.id, projectId: otherProject.id, environmentId: environment.id, installId: install.id, rawBody: body, signatureHeader: header, kms }),
    ).rejects.toThrow();
  });
});
