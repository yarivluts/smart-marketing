import { PipelineMessageModel } from '../models/pipeline-message.model';
import { RawRecordModel } from '../models/raw-record.model';
import type { SchemaDefKind } from '../models/schema-def.model';
import { defaultPipelineTransport, type PipelineTransport } from '../pipeline/transport';
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
  transport?: PipelineTransport;
}

/**
 * Publishes every accepted ingest record to the pipeline (KAN-33). Called from `ingestBatch` right
 * after a batch's accepted records are known — see that function's own doc comment for why this and
 * `drainPendingPipelineMessages` are both wrapped best-effort there.
 */
export async function enqueueAcceptedRecordsForPipeline(
  params: EnqueueAcceptedRecordsParams,
): Promise<PipelineMessageModel[]> {
  const transport = params.transport ?? defaultPipelineTransport;
  return Promise.all(
    params.records.map((record) =>
      transport.publish({
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
  await message.save();
}

export interface DrainPipelineParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  limit?: number;
  sink?: WarehouseSink;
}

export interface DrainPipelineResult {
  delivered: number;
  failed: number;
}

/**
 * The "Pub/Sub subscriber -> BigQuery insert" hop (KAN-33 AC: "event visible in BQ < 60s after
 * 202"). Lands every currently-`queued` message for one org/project/environment into the warehouse
 * sink, oldest first, capped at `limit`. A message whose landing throws is marked `failed` rather
 * than aborting the rest of the drain — retrying/replaying a `failed` message is KAN-34's DLQ, not
 * this story's.
 *
 * `ingestBatch` calls this synchronously, right after `enqueueAcceptedRecordsForPipeline`, in this
 * buildable-today version: there's no separate async worker or real Pub/Sub push subscription yet to
 * decouple the hop (that infra is KAN-38's orchestration / a real GCP project once KAN-18 lands).
 * Exported as its own function (not inlined) so a future real subscriber, or a scheduled catch-up
 * sweep over anything left `queued` by a prior partial failure, can call it directly.
 *
 * Would need a composite Firestore index (`environment_id`, `status`, `enqueued_at`) in a real
 * (non-emulator) project — the emulator used by this package's own tests doesn't enforce that.
 */
export async function drainPendingPipelineMessages(params: DrainPipelineParams): Promise<DrainPipelineResult> {
  const sink = params.sink ?? defaultWarehouseSink;
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

  let delivered = 0;
  let failed = 0;
  for (const message of pending as PipelineMessageModel[]) {
    await landMessage(message, sink);
    if (message.status === 'delivered') {
      delivered += 1;
    } else {
      failed += 1;
    }
  }
  return { delivered, failed };
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
