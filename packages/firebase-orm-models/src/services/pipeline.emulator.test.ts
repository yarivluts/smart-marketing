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
  listFailedPipelineMessagesForProject,
  listRawRecordsForBatch,
  replayFailedPipelineMessagesForProject,
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

describe('KAN-34 pipeline DLQ: listFailedPipelineMessagesForProject + replayFailedPipelineMessagesForProject', () => {
  function flakySinkFailingFor(clientId: string): WarehouseSink {
    const realSink = new FirestoreWarehouseSink();
    return {
      insertRawRecord: async (row: PipelineRecordEnvelope, id: string) => {
        if (row.clientId === clientId) {
          throw new Error('simulated warehouse outage');
        }
        await realSink.insertRawRecord(row, id);
      },
    };
  }

  it('lists a failed message across environments for one project and clears it once a replay lands successfully', async () => {
    const { organization, project, devEnvironment } = await setupProject('DLQ Replay Org');
    const batchId = unique('batch');

    await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: devEnvironment.id,
      batchId,
      kind: 'event',
      records: [{ clientId: 'evt-flaky', schemaName: 'order_completed', payload: { net: 1 } }],
    });
    const firstAttempt = await drainPendingPipelineMessages({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: devEnvironment.id,
      sink: flakySinkFailingFor('evt-flaky'),
    });
    expect(firstAttempt).toEqual({ delivered: 0, failed: 1 });

    const failed = await listFailedPipelineMessagesForProject(organization.id, project.id);
    expect(failed.map((m) => m.client_id)).toEqual(['evt-flaky']);
    expect(failed[0].failure_reason).toBe('simulated warehouse outage');

    // Retry with a healthy sink (KAN-34 AC: DLQ + replay) — the same message, no longer flaky, lands.
    const replay = await replayFailedPipelineMessagesForProject(organization.id, project.id);
    expect(replay).toEqual({ delivered: 1, failed: 0 });

    const rawRecords = await listRawRecordsForBatch(organization.id, project.id, batchId);
    expect(rawRecords.map((r) => r.client_id)).toEqual(['evt-flaky']);
    expect(await listFailedPipelineMessagesForProject(organization.id, project.id)).toHaveLength(0);
  });

  it('leaves a message failed with its reason refreshed when a replay attempt fails again', async () => {
    const { organization, project, prodEnvironment } = await setupProject('DLQ Still Failing Org');
    const batchId = unique('batch');

    await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      batchId,
      kind: 'event',
      records: [{ clientId: 'evt-still-bad', schemaName: 'order_completed', payload: {} }],
    });
    await drainPendingPipelineMessages({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      sink: flakySinkFailingFor('evt-still-bad'),
    });

    const replay = await replayFailedPipelineMessagesForProject(
      organization.id,
      project.id,
      undefined,
      flakySinkFailingFor('evt-still-bad'),
    );
    expect(replay).toEqual({ delivered: 0, failed: 1 });
    expect(await listFailedPipelineMessagesForProject(organization.id, project.id)).toHaveLength(1);
  });

  it('does not surface a failed message from a sibling project', async () => {
    const { organization, project, prodEnvironment } = await setupProject('DLQ Isolation Org A');
    const other = await setupProject('DLQ Isolation Org B');
    const batchId = unique('batch');

    await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      batchId,
      kind: 'event',
      records: [{ clientId: 'evt-bad', schemaName: 'order_completed', payload: {} }],
    });
    await drainPendingPipelineMessages({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      sink: flakySinkFailingFor('evt-bad'),
    });

    expect(await listFailedPipelineMessagesForProject(other.organization.id, other.project.id)).toHaveLength(0);
  });
});
