import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BigQueryRawRecordSink,
  createOrganizationWithOwner,
  createProject,
  DualWarehouseSink,
  drainPendingPipelineMessages,
  ensureUserForFirebaseSession,
  enqueueAcceptedRecordsForPipeline,
  FirestoreWarehouseSink,
  landPipelineMessages,
  listAuditLogEntriesForOrg,
  listFailedPipelineMessagesForProject,
  listQueuedPipelineMessagesForProject,
  listRawRecordsForBatch,
  listRecentBillingEventsForProject,
  ProjectNotFoundError,
  RawRecordModel,
  replayFailedPipelineMessagesForProject,
  sweepQueuedPipelineMessagesForProject,
  type BigQueryInsertClient,
  type BigQueryInsertRow,
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

describe('listQueuedPipelineMessagesForProject + sweepQueuedPipelineMessagesForProject', () => {
  it('lists a stuck queued message across environments for one project and clears it once swept', async () => {
    const { organization, project, owner, devEnvironment, prodEnvironment } = await setupProject('Stuck Queue Org');

    // Two messages enqueued but never landed (e.g. a crash between publish and land) — one per
    // environment, to prove the project-wide listing folds every environment together.
    await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: devEnvironment.id,
      batchId: unique('batch'),
      kind: 'event',
      records: [{ clientId: 'evt-stuck-dev', schemaName: 'order_completed', payload: { net: 1 } }],
    });
    await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      batchId: unique('batch'),
      kind: 'event',
      records: [{ clientId: 'evt-stuck-prod', schemaName: 'order_completed', payload: { net: 2 } }],
    });

    const queued = await listQueuedPipelineMessagesForProject(organization.id, project.id);
    expect(queued.map((m) => m.client_id).sort()).toEqual(['evt-stuck-dev', 'evt-stuck-prod']);

    const result = await sweepQueuedPipelineMessagesForProject(organization.id, project.id, undefined, undefined, owner.id);
    expect(result).toEqual({ delivered: 2, failed: 0 });
    expect(await listQueuedPipelineMessagesForProject(organization.id, project.id)).toHaveLength(0);

    const auditEntries = await listAuditLogEntriesForOrg(organization.id);
    const sweepEntry = auditEntries.find((entry) => entry.action === 'pipeline_message.sweep');
    expect(sweepEntry).toBeDefined();
    expect(sweepEntry?.after).toEqual({ attempted: 2, delivered: 2, failed: 0 });
  });

  it('does not re-sweep an already-delivered message', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Sweep Idempotent Org');

    await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      batchId: unique('batch'),
      kind: 'event',
      records: [{ clientId: 'evt-1', schemaName: 'order_completed', payload: {} }],
    });

    const first = await sweepQueuedPipelineMessagesForProject(organization.id, project.id);
    const second = await sweepQueuedPipelineMessagesForProject(organization.id, project.id);

    expect(first).toEqual({ delivered: 1, failed: 0 });
    expect(second).toEqual({ delivered: 0, failed: 0 });
  });

  it('does not surface or sweep a stuck message from a sibling project', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Sweep Isolation Org A');
    const other = await setupProject('Sweep Isolation Org B');

    await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      batchId: unique('batch'),
      kind: 'event',
      records: [{ clientId: 'evt-1', schemaName: 'order_completed', payload: {} }],
    });

    expect(await listQueuedPipelineMessagesForProject(other.organization.id, other.project.id)).toHaveLength(0);
    expect(await sweepQueuedPipelineMessagesForProject(other.organization.id, other.project.id)).toEqual({ delivered: 0, failed: 0 });

    // The sibling project's own stuck message is untouched by the other project's sweep.
    expect(await listQueuedPipelineMessagesForProject(organization.id, project.id)).toHaveLength(1);
  });
});

describe('KAN-18 phase 3: DualWarehouseSink lands into both Firestore and BigQuery', () => {
  function fakeBigQueryClient(): { client: BigQueryInsertClient; inserted: BigQueryInsertRow[] } {
    const inserted: BigQueryInsertRow[] = [];
    return {
      inserted,
      client: {
        insertRows: async (_datasetId, _tableId, rows) => {
          inserted.push(...rows);
        },
      },
    };
  }

  it('lands a message into Firestore RawRecordModel and the BigQuery raw_records export in one drain', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Dual Sink Org');
    const batchId = unique('batch');
    const { client, inserted } = fakeBigQueryClient();
    const dualSink = new DualWarehouseSink(
      new FirestoreWarehouseSink(),
      new BigQueryRawRecordSink({ client, dataset: 'growthos_raw' }),
    );

    await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      batchId,
      kind: 'event',
      records: [{ clientId: 'evt-1', schemaName: 'order_completed', payload: { net: 42 } }],
    });
    const result = await drainPendingPipelineMessages({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      sink: dualSink,
    });

    expect(result).toEqual({ delivered: 1, failed: 0 });

    const rawRecords = await listRawRecordsForBatch(organization.id, project.id, batchId);
    expect(rawRecords.map((r) => r.client_id)).toEqual(['evt-1']);

    expect(inserted).toHaveLength(1);
    expect(inserted[0].insertId).toBe(rawRecords[0].id);
    expect(inserted[0].json).toMatchObject({
      organization_id: organization.id,
      project_id: project.id,
      environment_id: prodEnvironment.id,
      batch_id: batchId,
      client_id: 'evt-1',
      payload: JSON.stringify({ net: 42 }),
    });
  });

  it('marks the message failed (not delivered) when the BigQuery export leg fails, even though Firestore already landed it', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Dual Sink Failure Org');
    const batchId = unique('batch');
    const failingBigQuerySink: WarehouseSink = {
      insertRawRecord: async () => {
        throw new Error('simulated BigQuery outage');
      },
    };
    const dualSink = new DualWarehouseSink(new FirestoreWarehouseSink(), failingBigQuerySink);

    await enqueueAcceptedRecordsForPipeline({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      batchId,
      kind: 'event',
      records: [{ clientId: 'evt-1', schemaName: 'order_completed', payload: {} }],
    });
    const result = await drainPendingPipelineMessages({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      sink: dualSink,
    });

    // Firestore's own write succeeded (it's landed and readable) — only the overall message status
    // reflects the BigQuery leg's failure, so a later DLQ replay retries both legs (idempotently).
    expect(result).toEqual({ delivered: 0, failed: 1 });
    const rawRecords = await listRawRecordsForBatch(organization.id, project.id, batchId);
    expect(rawRecords.map((r) => r.client_id)).toEqual(['evt-1']);
    expect(await listFailedPipelineMessagesForProject(organization.id, project.id)).toHaveLength(1);
  });
});

/** Directly lands one raw record (bypassing the full ingest pipeline) at a caller-chosen `landedAt`/payload — same helper shape as `tracking-alert.emulator.test.ts`'s own copy, so ordering/payload can be controlled precisely. */
async function landRawRecord(params: {
  organizationId: string;
  projectId: string;
  environmentId: string;
  schemaName: string;
  landedAt: string;
  payload?: Record<string, unknown>;
}): Promise<RawRecordModel> {
  const record = new RawRecordModel();
  record.organization_id = params.organizationId;
  record.project_id = params.projectId;
  record.environment_id = params.environmentId;
  record.partition_date = params.landedAt.slice(0, 10);
  record.batch_id = unique('batch');
  record.kind = 'event';
  record.schema_name = params.schemaName;
  record.client_id = unique('client');
  record.payload = params.payload ?? {};
  record.landed_at = params.landedAt;
  record.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await record.save();
  return record;
}

describe('listRecentBillingEventsForProject (KAN-80 billing-ops feed)', () => {
  it('returns only the billing event schemas, newest first, folded across every environment', async () => {
    const { organization, project, prodEnvironment, devEnvironment } = await setupProject('Billing Ops Org');

    await landRawRecord({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      schemaName: 'stripe_charge',
      landedAt: '2026-08-22T10:00:00.000Z',
      payload: { charge_id: 'ch_1', amount: 5000, currency: 'usd', status: 'succeeded' },
    });
    await landRawRecord({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: devEnvironment.id,
      schemaName: 'stripe_failed_payment',
      landedAt: '2026-08-22T11:00:00.000Z',
      payload: { charge_id: 'ch_2', amount: 1200, currency: 'usd', failure_message: 'Your card was declined.' },
    });
    await landRawRecord({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      schemaName: 'stripe_refund',
      landedAt: '2026-08-22T12:00:00.000Z',
      payload: { refund_id: 're_1', charge_id: 'ch_1', amount: 5000, currency: 'usd', reason: 'requested_by_customer' },
    });
    // A non-billing event (e.g. a product-analytics event) must never show up in the feed.
    await landRawRecord({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      schemaName: 'order_completed',
      landedAt: '2026-08-22T13:00:00.000Z',
      payload: { net: 42 },
    });

    const entries = await listRecentBillingEventsForProject(organization.id, project.id);

    expect(entries.map((entry) => entry.schema_name)).toEqual(['stripe_refund', 'stripe_failed_payment', 'stripe_charge']);
    expect(entries.map((entry) => entry.environment_id)).toEqual([prodEnvironment.id, devEnvironment.id, prodEnvironment.id]);
  });

  it('bounds each schema to `limit` and trims the merged, re-sorted result to `limit` overall', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Billing Ops Cap Org');

    for (let i = 0; i < 5; i += 1) {
      await landRawRecord({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: prodEnvironment.id,
        schemaName: 'stripe_charge',
        landedAt: `2026-08-22T10:0${i}:00.000Z`,
        payload: { charge_id: `ch_${i}` },
      });
    }

    const entries = await listRecentBillingEventsForProject(organization.id, project.id, 3);

    expect(entries).toHaveLength(3);
    // Newest-first, so the 3 kept are the 3 most recently landed, not the 3 earliest.
    expect(entries[0].landed_at).toBe('2026-08-22T10:04:00.000Z');
    expect(entries[2].landed_at).toBe('2026-08-22T10:02:00.000Z');
  });

  it('throws ProjectNotFoundError for a project id that does not belong to the given org', async () => {
    const { organization: orgA } = await setupProject('Billing Ops Org A');
    const { project: projectB } = await setupProject('Billing Ops Org B');

    await expect(listRecentBillingEventsForProject(orgA.id, projectB.id)).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});
