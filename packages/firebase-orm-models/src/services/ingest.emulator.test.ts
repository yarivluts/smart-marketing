import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  EmptyIngestBatchError,
  ensureUserForFirebaseSession,
  getIngestBatch,
  IngestBatchNotFoundError,
  ingestBatch,
  IngestRecordModel,
  InvalidIngestRecordError,
  registerSchemaDefinition,
  type IngestRecordInput,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-32's ingest batch service layer. */

beforeAll(async () => {
  await connectToFirestoreEmulator('ingest-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const prodEnvironment = environments.find((e) => e.name === 'prod')!;
  return { owner, organization, project, prodEnvironment };
}

async function registerOrderCompletedSchema(organizationId: string, projectId: string, createdByUserId: string) {
  await registerSchemaDefinition({
    organizationId,
    projectId,
    kind: 'event',
    name: 'order_completed',
    fields: [
      { name: 'order_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
      { name: 'net', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
      { name: 'currency', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
    ],
    createdByUserId,
  });
}

/** An `order_completed` event record; `raw` is just `data` wrapped in a plausible event envelope, since these tests don't care about anything beyond `data` unless noted. */
function orderEvent(clientRecordId: string, data: Record<string, unknown>): IngestRecordInput {
  return { clientRecordId, name: 'order_completed', data, raw: { event_id: clientRecordId, event: 'order_completed', properties: data } };
}

describe('ingestBatch', () => {
  it('accepts a record that matches the active schema', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Ingest Accept Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);

    const result = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      kind: 'event',
      records: [orderEvent('ord_1-evt', { order_id: 'ord_1', net: 100 })],
    });

    expect(result.submitted).toBe(1);
    expect(result.accepted).toBe(1);
    expect(result.quarantined).toBe(0);
    expect(result.duplicate).toBe(0);
    expect(result.records[0]).toMatchObject({ clientRecordId: 'ord_1-evt', status: 'accepted', reasons: [] });
  });

  it('quarantines a record missing a required field, with a reason', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Ingest Quarantine Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);

    const result = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      kind: 'event',
      records: [orderEvent('ord_2-evt', { order_id: 'ord_2' })],
    });

    expect(result.accepted).toBe(0);
    expect(result.quarantined).toBe(1);
    expect(result.records[0].status).toBe('quarantined');
    expect(result.records[0].reasons).toEqual(['Missing required field "net".']);
  });

  it('quarantines a record whose field has the wrong type', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Ingest Wrong Type Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);

    const result = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      kind: 'event',
      records: [orderEvent('ord_3-evt', { order_id: 'ord_3', net: 'a lot' })],
    });

    expect(result.quarantined).toBe(1);
    expect(result.records[0].reasons).toEqual(['Field "net" expected type "number".']);
  });

  it('quarantines a record for a name with no registered schema', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Ingest No Schema Org');

    const result = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      kind: 'event',
      records: [{ clientRecordId: 'ord_4-evt', name: 'never_registered', data: {}, raw: {} }],
    });

    expect(result.quarantined).toBe(1);
    expect(result.records[0].reasons).toEqual(['No active schema registered for event "never_registered".']);
  });

  it('dedupes a repeated client id within the same batch', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Ingest Intra Batch Dup Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);

    const result = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      kind: 'event',
      records: [
        orderEvent('ord_5-evt', { order_id: 'ord_5', net: 100 }),
        orderEvent('ord_5-evt', { order_id: 'ord_5', net: 100 }),
      ],
    });

    expect(result.submitted).toBe(2);
    expect(result.accepted).toBe(1);
    expect(result.duplicate).toBe(1);
    expect(result.records[1].status).toBe('duplicate');
  });

  it('dedupes a client id already accepted in an earlier batch, but reprocesses one that was only ever quarantined', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Ingest Cross Batch Dup Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);

    const baseParams = {
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      kind: 'event' as const,
    };

    await ingestBatch({ ...baseParams, records: [orderEvent('ord_6-evt', { order_id: 'ord_6', net: 100 })] });

    const secondSubmission = await ingestBatch({
      ...baseParams,
      records: [orderEvent('ord_6-evt', { order_id: 'ord_6', net: 100 })],
    });
    expect(secondSubmission.duplicate).toBe(1);
    expect(secondSubmission.accepted).toBe(0);

    await ingestBatch({ ...baseParams, records: [orderEvent('ord_7-evt', { order_id: 'ord_7' })] });
    const retryAfterFix = await ingestBatch({
      ...baseParams,
      records: [orderEvent('ord_7-evt', { order_id: 'ord_7', net: 50 })],
    });
    expect(retryAfterFix.duplicate).toBe(0);
    expect(retryAfterFix.accepted).toBe(1);
  });

  it('does not dedupe the same client id across two different environments', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Ingest Env Isolation Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);
    const stagingEnvironmentId = `${prodEnvironment.id}-staging-stand-in`;

    const first = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      kind: 'event',
      records: [orderEvent('ord_8-evt', { order_id: 'ord_8', net: 100 })],
    });
    expect(first.accepted).toBe(1);

    const second = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: stagingEnvironmentId,
      kind: 'event',
      records: [orderEvent('ord_8-evt', { order_id: 'ord_8', net: 100 })],
    });
    expect(second.duplicate).toBe(0);
    expect(second.accepted).toBe(1);
  });

  it('accepts an entity record against its registered schema, sharing one type across the batch', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Ingest Entity Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'entity',
      name: 'product',
      fields: [{ name: 'title', type: 'string', isRequired: true, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    const result = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      kind: 'entity',
      records: [
        { clientRecordId: 'sku_1', name: 'product', data: { title: 'Widget' }, raw: { id: 'sku_1', type: 'product', attributes: { title: 'Widget' } } },
        { clientRecordId: 'sku_2', name: 'product', data: {}, raw: { id: 'sku_2', type: 'product', attributes: {} } },
      ],
    });

    expect(result.accepted).toBe(1);
    expect(result.quarantined).toBe(1);
    expect(result.records[1].reasons).toEqual(['Missing required field "title".']);
  });

  it('accepts a measure record, and persists its full raw payload (value/currency) even though only dimensions are schema-validated', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Ingest Measure Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'measure',
      name: 'ad_spend',
      fields: [{ name: 'channel', type: 'string', isRequired: true, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    const raw = { measure: 'ad_spend', ts: '2026-07-02', dimensions: { channel: 'meta' }, value: 1250.5, currency: 'USD' };
    const result = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      kind: 'measure',
      records: [{ clientRecordId: 'measure-key-1', name: 'ad_spend', data: { channel: 'meta' }, raw }],
    });

    expect(result.accepted).toBe(1);

    const persisted = await IngestRecordModel.initPath({ organization_id: organization.id, project_id: project.id })
      .where('batch_id', '==', result.batchId)
      .get();
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.payload).toEqual(raw);
    expect(persisted[0]!.payload.value).toBe(1250.5);
    expect(persisted[0]!.payload.currency).toBe('USD');
  });

  it('rejects an empty batch', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Ingest Empty Batch Org');
    await expect(
      ingestBatch({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: prodEnvironment.id,
        kind: 'event',
        records: [],
      }),
    ).rejects.toThrow(EmptyIngestBatchError);
  });

  it('rejects a record with a blank client id or a blank name', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Ingest Invalid Record Org');
    await expect(
      ingestBatch({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: prodEnvironment.id,
        kind: 'event',
        records: [{ clientRecordId: '  ', name: 'order_completed', data: {}, raw: {} }],
      }),
    ).rejects.toThrow(InvalidIngestRecordError);

    await expect(
      ingestBatch({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: prodEnvironment.id,
        kind: 'event',
        records: [{ clientRecordId: 'ord_9-evt', name: '', data: {}, raw: {} }],
      }),
    ).rejects.toThrow(InvalidIngestRecordError);
  });
});

describe('getIngestBatch', () => {
  it('returns batch metadata and per-record results', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Ingest Get Batch Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);

    const submitted = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      kind: 'event',
      records: [orderEvent('ord_10-evt', { order_id: 'ord_10', net: 100 }), orderEvent('ord_11-evt', { order_id: 'ord_11' })],
    });

    const detail = await getIngestBatch(organization.id, project.id, prodEnvironment.id, submitted.batchId);
    expect(detail.submitted).toBe(2);
    expect(detail.accepted).toBe(1);
    expect(detail.quarantined).toBe(1);
    expect(detail.kind).toBe('event');
    expect(detail.records.map((r) => r.clientRecordId).sort()).toEqual(['ord_10-evt', 'ord_11-evt']);
  });

  it('rejects an unknown batch id, and a real batch id from a different project', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Ingest Get Missing Batch Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other App' });

    await expect(getIngestBatch(organization.id, project.id, prodEnvironment.id, 'does-not-exist')).rejects.toThrow(
      IngestBatchNotFoundError,
    );

    const submitted = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      kind: 'event',
      records: [orderEvent('ord_12-evt', { order_id: 'ord_12', net: 100 })],
    });

    await expect(
      getIngestBatch(organization.id, otherProject.id, prodEnvironment.id, submitted.batchId),
    ).rejects.toThrow(IngestBatchNotFoundError);
  });

  it('rejects a real batch id from a different environment in the same org/project', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Ingest Get Wrong Env Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);

    const submitted = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      kind: 'event',
      records: [orderEvent('ord_13-evt', { order_id: 'ord_13', net: 100 })],
    });

    await expect(
      getIngestBatch(organization.id, project.id, `${prodEnvironment.id}-staging-stand-in`, submitted.batchId),
    ).rejects.toThrow(IngestBatchNotFoundError);
  });
});
