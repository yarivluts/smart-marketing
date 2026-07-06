import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  drainPendingPipelineMessages,
  ensureUserForFirebaseSession,
  enqueueAcceptedRecordsForPipeline,
  FirestoreWarehouseSink,
  landPipelineMessages,
  listRawRecordsForBatch,
  type PipelineRecordEnvelope,
  type WarehouseSink,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-33's pipeline service: the publish (outbox) and drain (warehouse-landing) hops. */

beforeAll(async () => {
  await connectToFirestoreEmulator('pipeline-service-tests');
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
  const devEnvironment = environments.find((e) => e.name === 'dev')!;
  return { owner, organization, project, prodEnvironment, devEnvironment };
}

describe('enqueueAcceptedRecordsForPipeline + drainPendingPipelineMessages', () => {
  it('lands a queued message into the warehouse sink and marks it delivered', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Pipeline Org');
    const batchId = unique('batch');

    const startedAt = Date.now();
    await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      batchId,
      kind: 'event',
      records: [{ clientId: 'evt-1', schemaName: 'order_completed', payload: { event_id: 'evt-1', net: 349 } }],
    });
    const result = await drainPendingPipelineMessages({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
    });
    const elapsedMs = Date.now() - startedAt;

    expect(result).toEqual({ delivered: 1, failed: 0 });
    expect(elapsedMs).toBeLessThan(60_000);

    const rawRecords = await listRawRecordsForBatch(organization.id, project.id, batchId);
    expect(rawRecords).toHaveLength(1);
    expect(rawRecords[0].client_id).toBe('evt-1');
    expect(rawRecords[0].schema_name).toBe('order_completed');
    expect(rawRecords[0].payload).toEqual({ event_id: 'evt-1', net: 349 });
    expect(rawRecords[0].partition_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('does not re-drain an already-delivered message', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Redrain Org');
    const batchId = unique('batch');

    await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      batchId,
      kind: 'event',
      records: [{ clientId: 'evt-1', schemaName: 'order_completed', payload: { net: 1 } }],
    });
    const first = await drainPendingPipelineMessages({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
    });
    const second = await drainPendingPipelineMessages({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
    });

    expect(first).toEqual({ delivered: 1, failed: 0 });
    expect(second).toEqual({ delivered: 0, failed: 0 });
  });

  it('does not drain messages queued for a different environment', async () => {
    const { organization, project, prodEnvironment, devEnvironment } = await setupProject('Env Isolation Org');
    const batchId = unique('batch');

    await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      batchId,
      kind: 'event',
      records: [{ clientId: 'evt-1', schemaName: 'order_completed', payload: {} }],
    });
    const devDrain = await drainPendingPipelineMessages({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: devEnvironment.id,
    });
    const prodDrain = await drainPendingPipelineMessages({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
    });

    expect(devDrain).toEqual({ delivered: 0, failed: 0 });
    expect(prodDrain).toEqual({ delivered: 1, failed: 0 });
  });

  it('marks a message failed (without aborting the rest of the drain) when the sink throws for it', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Sink Failure Org');
    const batchId = unique('batch');

    const realSink = new FirestoreWarehouseSink();
    const flakySink: WarehouseSink = {
      insertRawRecord: async (row: PipelineRecordEnvelope, id: string) => {
        if (row.clientId === 'evt-bad') {
          throw new Error('simulated warehouse outage');
        }
        await realSink.insertRawRecord(row, id);
      },
    };

    await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      batchId,
      kind: 'event',
      records: [
        { clientId: 'evt-good', schemaName: 'order_completed', payload: {} },
        { clientId: 'evt-bad', schemaName: 'order_completed', payload: {} },
      ],
    });
    const result = await drainPendingPipelineMessages({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      sink: flakySink,
    });

    expect(result).toEqual({ delivered: 1, failed: 1 });
    const rawRecords = await listRawRecordsForBatch(organization.id, project.id, batchId);
    expect(rawRecords.map((r) => r.client_id)).toEqual(['evt-good']);
  });

  it('respects the drain limit, leaving the remainder queued for a later drain', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Drain Limit Org');
    const batchId = unique('batch');

    await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      batchId,
      kind: 'event',
      records: [
        { clientId: 'evt-1', schemaName: 'order_completed', payload: {} },
        { clientId: 'evt-2', schemaName: 'order_completed', payload: {} },
        { clientId: 'evt-3', schemaName: 'order_completed', payload: {} },
      ],
    });

    const firstDrain = await drainPendingPipelineMessages({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      limit: 2,
    });
    const secondDrain = await drainPendingPipelineMessages({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      limit: 2,
    });

    expect(firstDrain).toEqual({ delivered: 2, failed: 0 });
    expect(secondDrain).toEqual({ delivered: 1, failed: 0 });
  });
});

describe('landPipelineMessages', () => {
  it('lands exactly the given messages, ignoring other queued messages left in the same environment', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Scoped Landing Org');

    // A stray message left `queued` by some other batch/caller in the same org/project/environment —
    // `landPipelineMessages` must not touch it; only `drainPendingPipelineMessages` (a separate,
    // explicit backlog sweep) does.
    const strayBatchId = unique('stray-batch');
    await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      batchId: strayBatchId,
      kind: 'event',
      records: [{ clientId: 'stray-evt', schemaName: 'order_completed', payload: {} }],
    });

    const ownBatchId = unique('own-batch');
    const ownMessages = await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      batchId: ownBatchId,
      kind: 'event',
      records: [{ clientId: 'own-evt', schemaName: 'order_completed', payload: {} }],
    });

    const result = await landPipelineMessages(ownMessages);

    expect(result).toEqual({ delivered: 1, failed: 0 });
    const ownRawRecords = await listRawRecordsForBatch(organization.id, project.id, ownBatchId);
    expect(ownRawRecords.map((r) => r.client_id)).toEqual(['own-evt']);
    const strayRawRecords = await listRawRecordsForBatch(organization.id, project.id, strayBatchId);
    expect(strayRawRecords).toHaveLength(0);
  });
});
