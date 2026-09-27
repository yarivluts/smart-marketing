import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertPublicHttpsUrl,
  attributeIngestBatchToBackfill,
  BackfillAlreadyFinishedError,
  BackfillEndpointNotConfiguredError,
  BackfillNotFoundError,
  completeBackfill,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  generateLocalKmsKeyRing,
  getBackfillStatus,
  ingestBatch,
  InvalidBackfillEndpointError,
  isNonPublicAddress,
  listBackfills,
  LocalKmsProvider,
  registerSchemaDefinition,
  requestBackfill,
  setBackfillEndpoint,
  signStandardWebhook,
  type BackfillDeliveryRequest,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** The backfill loop: registration (SSRF-guarded), signed delivery with retries, attribution, completion. */

beforeAll(async () => {
  await connectToFirestoreEmulator('backfill-tests');
});

const publicResolver = async () => ['203.0.113.10'];
const noSleep = async () => {};

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function kms() {
  const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
  return new LocalKmsProvider(keyRing, currentKeyId);
}

async function setup(name: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'App' });
  const dev = environments.find((environment) => environment.name === 'dev')!;
  const prod = environments.find((environment) => environment.name === 'prod')!;
  await registerSchemaDefinition({
    organizationId: organization.id,
    projectId: project.id,
    kind: 'entity',
    name: 'customer',
    fields: [{ name: 'plan', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
    createdByUserId: owner.id,
  });
  return { owner, organizationId: organization.id, projectId: project.id, dev, prod, kms: kms() };
}

async function registered(name: string) {
  const ctx = await setup(name);
  const result = await setBackfillEndpoint({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    environmentId: ctx.dev.id,
    url: 'https://backfill.example.com/hook',
    schemas: [{ kind: 'entity', name: 'customer' }],
    kms: ctx.kms,
    actedByUserId: ctx.owner.id,
    resolver: publicResolver,
  });
  return { ...ctx, secret: result.signingSecret! };
}

describe('signing and address checks (pure)', () => {
  it('signs "id.timestamp.body" with the decoded whsec_ key, per Standard Webhooks', () => {
    const key = Buffer.from('super-secret-key-bytes');
    const secret = `whsec_${key.toString('base64')}`;
    const expected = createHmac('sha256', key).update('msg_1.1700000000.{"a":1}').digest('base64');
    expect(signStandardWebhook(secret, 'msg_1', 1700000000, '{"a":1}')).toBe(`v1,${expected}`);
  });

  it('treats a secret without the prefix as raw UTF-8', () => {
    const expected = createHmac('sha256', Buffer.from('plain')).update('id.1.b').digest('base64');
    expect(signStandardWebhook('plain', 'id', 1, 'b')).toBe(`v1,${expected}`);
  });

  it.each(['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.20.1.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1'])('%s is not public', (address) => {
    expect(isNonPublicAddress(address)).toBe(true);
  });

  it.each(['203.0.113.10', '8.8.8.8', '2001:4860:4860::8888'])('%s is public', (address) => {
    expect(isNonPublicAddress(address)).toBe(false);
  });

  it('refuses http, credentials, and hosts that resolve to private addresses', async () => {
    await expect(assertPublicHttpsUrl('http://example.com', publicResolver)).rejects.toThrow('https');
    await expect(assertPublicHttpsUrl('https://user:pw@example.com', publicResolver)).rejects.toThrow('credentials');
    await expect(assertPublicHttpsUrl('https://internal.example.com', async () => ['10.1.2.3'])).rejects.toThrow('public address');
    await expect(assertPublicHttpsUrl('https://169.254.169.254/latest', publicResolver)).rejects.toThrow('public address');
    await expect(assertPublicHttpsUrl('https://example.com/x', publicResolver)).resolves.toBeInstanceOf(URL);
  });
});

describe('setBackfillEndpoint', () => {
  it('returns the signing secret once, and a new one only when rotated', async () => {
    const ctx = await registered('Backfill Register Org');
    expect(ctx.secret).toMatch(/^whsec_/);
    const again = await setBackfillEndpoint({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      environmentId: ctx.dev.id,
      url: 'https://backfill.example.com/v2',
      schemas: [{ kind: 'entity', name: 'customer' }],
      kms: ctx.kms,
      actedByUserId: ctx.owner.id,
      resolver: publicResolver,
    });
    expect(again.signingSecret).toBeUndefined();
    expect(again.endpoint.url).toBe('https://backfill.example.com/v2');
    const rotated = await setBackfillEndpoint({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      environmentId: ctx.dev.id,
      url: 'https://backfill.example.com/v2',
      schemas: [{ kind: 'entity', name: 'customer' }],
      rotateSecret: true,
      kms: ctx.kms,
      actedByUserId: ctx.owner.id,
      resolver: publicResolver,
    });
    expect(rotated.signingSecret).toMatch(/^whsec_/);
    expect(rotated.signingSecret).not.toBe(ctx.secret);
  });

  it('refuses unregistered schemas', async () => {
    const ctx = await setup('Backfill Schema Org');
    await expect(
      setBackfillEndpoint({
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        environmentId: ctx.dev.id,
        url: 'https://backfill.example.com/hook',
        schemas: [{ kind: 'entity', name: 'account' }],
        kms: ctx.kms,
        actedByUserId: ctx.owner.id,
        resolver: publicResolver,
      }),
    ).rejects.toBeInstanceOf(InvalidBackfillEndpointError);
  });
});

describe('requestBackfill', () => {
  it('delivers a signed backfill.requested the endpoint can verify', async () => {
    const ctx = await registered('Backfill Deliver Org');
    const sent: BackfillDeliveryRequest[] = [];
    const request = await requestBackfill({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      environmentId: ctx.dev.id,
      requestedByUserId: ctx.owner.id,
      kms: ctx.kms,
      resolver: publicResolver,
      sleep: noSleep,
      transport: async (delivery) => {
        sent.push(delivery);
        return 202;
      },
    });
    expect(request.status).toBe('delivered');
    expect(sent).toHaveLength(1);
    const body = JSON.parse(sent[0].body);
    expect(body).toMatchObject({ type: 'backfill.requested', backfill_id: request.id, project_id: ctx.projectId, environment: 'dev', schemas: [{ kind: 'entity', name: 'customer' }] });
    const { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature } = sent[0].headers;
    expect(signature).toBe(signStandardWebhook(ctx.secret, id, Number(timestamp), sent[0].body));
  });

  it('retries a 5xx with the same webhook-id, and fails a 4xx without retrying', async () => {
    const ctx = await registered('Backfill Retry Org');
    const ids: string[] = [];
    const statuses = [503, 202];
    const retried = await requestBackfill({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      environmentId: ctx.dev.id,
      requestedByUserId: ctx.owner.id,
      kms: ctx.kms,
      resolver: publicResolver,
      sleep: noSleep,
      transport: async (delivery) => {
        ids.push(delivery.headers['webhook-id']);
        return statuses.shift()!;
      },
    });
    expect(retried).toMatchObject({ status: 'delivered', delivery_attempts: 2 });
    expect(new Set(ids).size).toBe(1);

    let calls = 0;
    const refused = await requestBackfill({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      environmentId: ctx.dev.id,
      requestedByUserId: ctx.owner.id,
      kms: ctx.kms,
      resolver: publicResolver,
      sleep: noSleep,
      transport: async () => {
        calls += 1;
        return 401;
      },
    });
    expect(refused).toMatchObject({ status: 'failed', delivery_attempts: 1, last_http_status: 401 });
    expect(calls).toBe(1);
  });

  it('refuses when no endpoint is registered for the environment', async () => {
    const ctx = await registered('Backfill No Endpoint Org');
    await expect(
      requestBackfill({ organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.prod.id, requestedByUserId: ctx.owner.id, kms: ctx.kms }),
    ).rejects.toBeInstanceOf(BackfillEndpointNotConfiguredError);
  });
});

describe('attribution, completion and status', () => {
  it('counts tagged batches in the right environment, then records completion', async () => {
    const ctx = await registered('Backfill Progress Org');
    const request = await requestBackfill({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      environmentId: ctx.dev.id,
      requestedByUserId: ctx.owner.id,
      kms: ctx.kms,
      resolver: publicResolver,
      sleep: noSleep,
      transport: async () => 202,
    });
    const batch = await ingestBatch({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      environmentId: ctx.dev.id,
      input: { kind: 'entity', type: 'customer', records: [{ id: 'c1', attributes: { plan: 'pro' } }, { id: 'c2', attributes: { plan: 'free', bad: 1 } }] },
    });
    expect(await attributeIngestBatchToBackfill({ organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.dev.id, batchId: batch.batchId, backfillId: request.id })).toBe(true);

    // A batch from another environment is never attributed.
    const prodBatch = await ingestBatch({ organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.prod.id, input: { kind: 'entity', type: 'customer', records: [{ id: 'c9', attributes: {} }] } });
    expect(await attributeIngestBatchToBackfill({ organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.prod.id, batchId: prodBatch.batchId, backfillId: request.id })).toBe(false);

    const receiving = await getBackfillStatus(ctx.organizationId, ctx.projectId, request.id, ctx.dev.id);
    expect(receiving).toMatchObject({ status: 'receiving', progress: { batches: 1, accepted: 1, quarantined: 1, duplicates: 0 } });

    await completeBackfill({ organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.dev.id, backfillId: request.id, status: 'completed', recordsSent: 2, batches: 1 });
    const done = await getBackfillStatus(ctx.organizationId, ctx.projectId, request.id, ctx.dev.id);
    expect(done).toMatchObject({ status: 'completed', report: { records_sent: 2, batches: 1 } });
    await expect(
      completeBackfill({ organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.dev.id, backfillId: request.id, status: 'completed', recordsSent: 2, batches: 1 }),
    ).rejects.toBeInstanceOf(BackfillAlreadyFinishedError);

    expect((await listBackfills(ctx.organizationId, ctx.projectId, ctx.dev.id)).map((entry) => entry.backfillId)).toEqual([request.id]);
    expect(await listBackfills(ctx.organizationId, ctx.projectId, ctx.prod.id)).toEqual([]);
  });

  it('hides a backfill from another environment', async () => {
    const ctx = await registered('Backfill Env Org');
    const request = await requestBackfill({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      environmentId: ctx.dev.id,
      requestedByUserId: ctx.owner.id,
      kms: ctx.kms,
      resolver: publicResolver,
      sleep: noSleep,
      transport: async () => 202,
    });
    await expect(getBackfillStatus(ctx.organizationId, ctx.projectId, request.id, ctx.prod.id)).rejects.toBeInstanceOf(BackfillNotFoundError);
    await expect(
      completeBackfill({ organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.prod.id, backfillId: request.id, status: 'completed', recordsSent: 0, batches: 0 }),
    ).rejects.toBeInstanceOf(BackfillNotFoundError);
  });
});
