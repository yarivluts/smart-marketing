import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  enqueueAcceptedRecordsForPipeline,
  FirestoreWarehouseSink,
  landPipelineMessages,
  listAuditLogEntriesForOrg,
  ProjectNotFoundError,
  reexportRawRecordsToWarehouse,
  WarehouseNotConfiguredError,
  type PipelineRecordEnvelope,
  type WarehouseSink,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for the EasySign-audit raw-record backfill (P-01). */

beforeAll(async () => {
  await connectToFirestoreEmulator('pipeline-reexport-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

/** Stands in for the BigQuery raw sink: records every row it is handed, keyed by the id the caller passed. */
class CapturingSink implements WarehouseSink {
  public readonly rows = new Map<string, PipelineRecordEnvelope>();

  constructor(private readonly failOnClientId?: string) {}

  async insertRawRecord(row: PipelineRecordEnvelope, id: string): Promise<void> {
    if (row.clientId === this.failOnClientId) {
      throw new Error('simulated streaming-insert failure');
    }
    this.rows.set(id, row);
  }
}

async function setupProjectWithLandedRecords(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'EasySign Growth' });
  const devEnvironment = environments.find((environment) => environment.name === 'dev')!;

  // Landed through the Firestore-only sink — exactly the state records were in before an environment's BigQuery export was configured.
  const messages = await enqueueAcceptedRecordsForPipeline({
    organizationId: organization.id,
    projectId: project.id,
    environmentId: devEnvironment.id,
    batchId: unique('batch'),
    kind: 'event',
    records: [
      { clientId: 'trial-1', schemaName: 'trial_started', payload: { event: 'trial_started', event_id: 'trial-1' } },
      { clientId: 'trial-2', schemaName: 'trial_started', payload: { event: 'trial_started', event_id: 'trial-2' } },
      { clientId: 'touch-1', schemaName: 'touchpoint', payload: { event: 'touchpoint', event_id: 'touch-1' } },
    ],
  });
  await landPipelineMessages(messages, { sink: new FirestoreWarehouseSink() });
  return { owner, organization, project };
}

describe('reexportRawRecordsToWarehouse', () => {
  it('streams the project\'s landed records into the warehouse sink keyed by their Firestore ids, optionally scoped to one schema, and audits the tally', async () => {
    const { owner, organization, project } = await setupProjectWithLandedRecords('Reexport Org');

    const scoped = new CapturingSink();
    const scopedResult = await reexportRawRecordsToWarehouse({ organizationId: organization.id, projectId: project.id, schemaName: 'trial_started', sink: scoped, performedByUserId: owner.id });
    expect(scopedResult).toEqual({ attempted: 2, exported: 2, failed: 0 });
    expect([...scoped.rows.values()].map((row) => row.schemaName)).toEqual(['trial_started', 'trial_started']);
    expect([...scoped.rows.values()].map((row) => row.payload.event_id).sort()).toEqual(['trial-1', 'trial-2']);

    const everything = new CapturingSink();
    const allResult = await reexportRawRecordsToWarehouse({ organizationId: organization.id, projectId: project.id, sink: everything });
    expect(allResult).toEqual({ attempted: 3, exported: 3, failed: 0 });

    const audit = await listAuditLogEntriesForOrg(organization.id);
    const entry = audit.find((candidate) => candidate.action === 'raw_record.reexport');
    expect(entry?.summary).toBe('Re-exported 2 of 2 raw record(s) for "trial_started" to the warehouse');
  });

  it('isolates one failing row from the rest of the batch', async () => {
    const { organization, project } = await setupProjectWithLandedRecords('Reexport Partial Org');
    const sink = new CapturingSink('trial-2');
    const result = await reexportRawRecordsToWarehouse({ organizationId: organization.id, projectId: project.id, sink });
    expect(result).toEqual({ attempted: 3, exported: 2, failed: 1 });
  });

  it('throws WarehouseNotConfiguredError when no BigQuery export exists, and ProjectNotFoundError for an unknown project', async () => {
    const { organization, project } = await setupProjectWithLandedRecords('Reexport Unconfigured Org');
    await expect(reexportRawRecordsToWarehouse({ organizationId: organization.id, projectId: project.id, sink: null })).rejects.toBeInstanceOf(WarehouseNotConfiguredError);
    await expect(reexportRawRecordsToWarehouse({ organizationId: organization.id, projectId: 'does-not-exist', sink: new CapturingSink() })).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});
