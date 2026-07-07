import { PipelineMessageModel } from '../models/pipeline-message.model';
import { RawRecordModel } from '../models/raw-record.model';
import type { SchemaDefKind } from '../models/schema-def.model';
import { publishPipelineMessage } from '../pipeline/transport';
import { defaultWarehouseSink, type WarehouseSink } from '../pipeline/sink';

/** Bounds one `drainPendingPipelineMessages` call — same load-bounding reasoning as `MAX_INGEST_BATCH_SIZE`. */
export const MAX_PIPELINE_DRAIN_BATCH_SIZE = 500;

export interface AcceptedPipelineRecord {
  clientId: string;
  schemaName: string;
  payload: Record<string, unknown>;
}

export interface EnqueueAcceptedRecordsParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  batchId: string;
  kind: SchemaDefKind;
  records: readonly AcceptedPipelineRecord[];
}

/**
 * Publishes every accepted ingest record to the pipeline (KAN-33). Each record is published
 * independently (`Promise.allSettled`, not a single `Promise.all`): a record whose own publish fails
 * is simply omitted from the returned array — it was never durably queued, so there's nothing to
 * land for it — without blocking its batch-mates from being queued, the same per-record failure
 * isolation as the dedup-key-claim writes just above this call in `ingestBatch`.
 */
export async function enqueueAcceptedRecordsForPipeline(
  params: EnqueueAcceptedRecordsParams,
): Promise<PipelineMessageModel[]> {
  const results = await Promise.allSettled(
    params.records.map((record) =>
      publishPipelineMessage({
        organizationId: params.organizationId,
        projectId: params.projectId,
        environmentId: params.environmentId,
        batchId: params.batchId,
        kind: params.kind,
        schemaName: record.schemaName,
        clientId: record.clientId,
        payload: record.payload,
      }),
    ),
  );
  return results
    .filter((result): result is PromiseFulfilledResult<PipelineMessageModel> => result.status === 'fulfilled')
    .map((result) => result.value);
}

async function landMessage(message: PipelineMessageModel, sink: WarehouseSink): Promise<void> {
  try {
    await sink.insertRawRecord(
      {
        organizationId: message.organization_id,
        projectId: message.project_id,
        environmentId: message.environment_id,
        batchId: message.batch_id,
        kind: message.kind,
        schemaName: message.schema_name,
        clientId: message.client_id,
        payload: message.payload,
      },
      message.id,
    );
    message.status = 'delivered';
    message.delivered_at = new Date().toISOString();
  } catch (error) {
    message.status = 'failed';
    message.failure_reason = error instanceof Error ? error.message : String(error);
  }
  try {
    await message.save();
  } catch {
    // Best-effort status update: if this write itself fails, the message is left `queued` in
    // Firestore even though it may already have landed — a later drain will simply try to land it
    // again, which is safe since landing is idempotent (keyed by this message's own id). Not caught
    // by the caller: a failure here must never abort landing the *other* messages in the same call.
  }
}

export interface DrainPipelineResult {
  delivered: number;
  failed: number;
}

/** Lands every given message in parallel — each is an independent write — and tallies the outcome. */
async function landMessages(messages: readonly PipelineMessageModel[], sink: WarehouseSink): Promise<DrainPipelineResult> {
  await Promise.all(messages.map((message) => landMessage(message, sink)));
  let delivered = 0;
  let failed = 0;
  for (const message of messages) {
    if (message.status === 'delivered') {
      delivered += 1;
    } else {
      failed += 1;
    }
  }
  return { delivered, failed };
}

export interface LandPipelineMessagesParams {
  sink?: WarehouseSink;
}

/**
 * The "Pub/Sub subscriber -> BigQuery insert" hop for a specific, already-known set of messages
 * (KAN-33 AC: "event visible in BQ < 60s after 202"). `ingestBatch` calls this with exactly the
 * messages it just published (see `enqueueAcceptedRecordsForPipeline`) — scoped to its own batch, not
 * the environment's whole backlog — so concurrent `ingestBatch` calls never race over the same
 * messages or pay for landing each other's records. A message whose landing throws is marked `failed`
 * rather than aborting the rest of the call; retrying/replaying a `failed` message is KAN-34's DLQ,
 * not this story's.
 */
export async function landPipelineMessages(
  messages: readonly PipelineMessageModel[],
  params: LandPipelineMessagesParams = {},
): Promise<DrainPipelineResult> {
  return landMessages(messages, params.sink ?? defaultWarehouseSink);
}

export interface DrainPipelineParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  limit?: number;
  sink?: WarehouseSink;
}

/**
 * A general-purpose catch-up sweep over anything still `queued` for one org/project/environment,
 * oldest first, capped at `limit` — for a future scheduled worker (KAN-38) or ops use, not called
 * from `ingestBatch` itself (that uses `landPipelineMessages` above, scoped to its own batch). Two
 * overlapping calls here can both fetch and land the same still-`queued` message before either has
 * updated it (no claim step) — wasted double work, not a correctness bug (landing is idempotent by
 * message id) — a gap acceptable for an occasional catch-up sweep but not for the hot ingest path.
 *
 * Ordering ("oldest first") is best-effort, not strict: messages published concurrently (as
 * `enqueueAcceptedRecordsForPipeline` does within one batch) can share a millisecond-resolution
 * `enqueued_at`, and nothing today depends on strict FIFO order across records.
 *
 * Would need a composite Firestore index (`environment_id`, `status`, `enqueued_at`) in a real
 * (non-emulator) project — the emulator this package's own tests run against doesn't enforce that.
 */
export async function drainPendingPipelineMessages(params: DrainPipelineParams): Promise<DrainPipelineResult> {
  const limit = Math.min(params.limit ?? MAX_PIPELINE_DRAIN_BATCH_SIZE, MAX_PIPELINE_DRAIN_BATCH_SIZE);

  const pending = await PipelineMessageModel.initPath({
    organization_id: params.organizationId,
    project_id: params.projectId,
  })
    .where('environment_id', '==', params.environmentId)
    .where('status', '==', 'queued')
    .orderBy('enqueued_at')
    .limit(limit)
    .get();

  return landMessages(pending as PipelineMessageModel[], params.sink ?? defaultWarehouseSink);
}

/** Every raw record landed for one batch — used by tests to verify the "visible in BQ" AC, and a building block a future KAN-35 ingest-health admin surface could reuse. */
export async function listRawRecordsForBatch(
  organizationId: string,
  projectId: string,
  batchId: string,
): Promise<RawRecordModel[]> {
  return RawRecordModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('batch_id', '==', batchId)
    .get();
}
