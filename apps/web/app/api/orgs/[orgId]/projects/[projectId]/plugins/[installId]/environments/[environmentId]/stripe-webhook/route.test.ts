import { createHmac, randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  decideResourceAttachment,
  ensureUserForFirebaseSession,
  requestResourceAttachment,
  setSharedCredentialSecret,
  STRIPE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  STRIPE_PLUGIN_ID,
  STRIPE_PLUGIN_MANIFEST_YAML,
  loadLocalKmsKeyRingFromEnv,
  LocalKmsProvider,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { installPlugin, registerPluginManifest } from '@/lib/orgs/mutations';
import { POST } from './route';

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  process.env.GROWTHOS_VAULT_KEYS = JSON.stringify({ currentKeyId: 'v1', keys: { v1: randomBytes(32).toString('base64') } });
  await ensureFirestoreOrm();
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

const WEBHOOK_SECRET = 'whsec_test_route_secret';

async function setupInstalledStripePlugin(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const environment = environments.find((e) => e.name === 'dev')!;
  // Must derive from the same GROWTHOS_VAULT_KEYS the route's own getServerKmsProvider() reads —
  // an independently generated key ring would encrypt the secret under a key the route can never unwrap.
  const { keyRing, currentKeyId } = loadLocalKmsKeyRingFromEnv();
  const kms = new LocalKmsProvider(keyRing, currentKeyId);

  const credential = await createSharedCredential({
    organizationId: organization.id,
    name: 'Stripe (test account)',
    provider: 'stripe',
    availableScopes: ['account'],
    createdByUserId: owner.id,
  });
  await setSharedCredentialSecret({
    organizationId: organization.id,
    credentialId: credential.id,
    secret: JSON.stringify({ apiSecretKey: 'sk_test_route', webhookSigningSecret: WEBHOOK_SECRET }),
    kms,
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

  return { owner, organization, project, environment, install };
}

function signedHeader(body: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function webhookRequest(
  orgId: string,
  projectId: string,
  installId: string,
  environmentId: string,
  body: string,
  signatureHeader?: string,
): {
  request: NextRequest;
  params: Promise<{ orgId: string; projectId: string; installId: string; environmentId: string }>;
} {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signatureHeader) {
    headers['stripe-signature'] = signatureHeader;
  }
  return {
    request: new NextRequest(
      `https://growthos.test/api/orgs/${orgId}/projects/${projectId}/plugins/${installId}/environments/${environmentId}/stripe-webhook`,
      { method: 'POST', headers, body },
    ),
    params: Promise.resolve({ orgId, projectId, installId, environmentId }),
  };
}

describe('POST .../plugins/[installId]/environments/[environmentId]/stripe-webhook', () => {
  it('requires no session — verifies purely by Stripe-Signature and lands a valid event', async () => {
    const { organization, project, environment, install } = await setupInstalledStripePlugin('Stripe Webhook Route Org');
    const body = JSON.stringify({
      id: 'evt_1',
      object: 'event',
      type: 'charge.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: { id: 'ch_1', object: 'charge', amount: 100, currency: 'usd', customer: 'cus_1', status: 'succeeded', refunded: false, amount_refunded: 0, created: Math.floor(Date.now() / 1000) },
      },
    });
    const { request, params } = webhookRequest(organization.id, project.id, install.id, environment.id, body, signedHeader(body, WEBHOOK_SECRET));

    const response = await POST(request, { params });
    expect(response.status).toBe(200);
    const responseBody = (await response.json()) as { eventId: string; handled: boolean };
    expect(responseBody).toEqual({ eventId: 'evt_1', handled: true });
  });

  it('returns 400 when the Stripe-Signature header is missing', async () => {
    const { request, params } = webhookRequest('org', 'project', 'install', 'env', '{}');
    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'missing_signature_header' });
  });

  it('returns 400 for a signature that does not verify', async () => {
    const { organization, project, environment, install } = await setupInstalledStripePlugin('Stripe Webhook Route Bad Sig Org');
    const body = '{"id":"evt_2","type":"charge.succeeded"}';
    const { request, params } = webhookRequest(organization.id, project.id, install.id, environment.id, body, signedHeader(body, 'whsec_wrong'));

    const response = await POST(request, { params });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_webhook' });
  });

  it('returns 404 for a project that does not exist — indistinguishable in shape from a bad-signature 400 only by status code, documented in route-isolation-guard.test.ts', async () => {
    const { request, params } = webhookRequest('does-not-exist-org', 'does-not-exist-project', 'install', 'env', '{}', signedHeader('{}', 'whsec_irrelevant'));
    const response = await POST(request, { params });
    expect(response.status).toBe(404);
  });
});
