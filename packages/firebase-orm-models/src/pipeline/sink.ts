import { RawRecordModel } from '../models/raw-record.model';
import { BigQueryRawRecordSink, createRealBigQueryInsertClient } from '../warehouse/bigquery-raw-sink';
import type { PipelineRecordEnvelope } from './record';

/**
 * The "land a record in the warehouse" boundary (KAN-33, plan `13 §E3.3`). `FirestoreWarehouseSink`
 * stands in for a real partitioned BigQuery raw table until KAN-18/KAN-37 provision one; once
 * configured, `defaultWarehouseSink` below dual-writes into both (see `DualWarehouseSink`). Kept as
 * an interface (unlike `transport.ts`'s plain `publishPipelineMessage` function) because it's
 * genuinely substituted today — `pipeline.emulator.test.ts` injects a failing sink to test the
 * per-message failure path.
 *
 * `id` is the source `PipelineMessageModel`'s own id, so a caller landing the same message twice
 * (a transient retry, or a future KAN-34 replay) overwrites the same row instead of duplicating it —
 * "at least once delivery, idempotent consumer".
 */
export interface WarehouseSink {
  insertRawRecord(row: PipelineRecordEnvelope, id: string): Promise<void>;
}

export class FirestoreWarehouseSink implements WarehouseSink {
  async insertRawRecord(row: PipelineRecordEnvelope, id: string): Promise<void> {
    const record = new RawRecordModel();
    record.organization_id = row.organizationId;
    record.project_id = row.projectId;
    record.environment_id = row.environmentId;
    record.batch_id = row.batchId;
    record.kind = row.kind;
    record.schema_name = row.schemaName;
    record.client_id = row.clientId;
    record.payload = row.payload;
    record.landed_at = new Date().toISOString();
    record.partition_date = record.landed_at.slice(0, 10);
    record.setPathParams({ organization_id: row.organizationId, project_id: row.projectId });
    await record.save(id);
  }
}

/**
 * Lands a record into two sinks in sequence (KAN-18 phase 3: exporting `RawRecordModel` into
 * BigQuery). If either write throws, this throws too — `landMessage` (`services/pipeline.service.ts`)
 * then marks the whole message `failed` rather than `delivered`, so it's picked up by a later
 * KAN-34 DLQ replay. That replay simply calls `insertRawRecord` again for both sinks; since both are
 * idempotent by `id` (a Firestore doc-id overwrite / a BigQuery `insertId` dedup), re-running a write
 * that already succeeded is safe, so requiring *both* to succeed before calling a message "delivered"
 * is strictly safer than silently swallowing the secondary sink's failure — a record that never
 * reaches BigQuery would otherwise go unnoticed rather than sitting in the DLQ where it's already
 * visible and replayable.
 */
export class DualWarehouseSink implements WarehouseSink {
  constructor(
    private readonly primary: WarehouseSink,
    private readonly secondary: WarehouseSink,
  ) {}

  async insertRawRecord(row: PipelineRecordEnvelope, id: string): Promise<void> {
    await this.primary.insertRawRecord(row, id);
    await this.secondary.insertRawRecord(row, id);
  }
}

/** Which real BigQuery project/dataset the raw-record export would stream into — see {@link readWarehouseSinkEnvConfig}. */
export interface WarehouseSinkEnvConfig {
  projectId?: string;
  dataset?: string;
}

/**
 * Reads the BigQuery project/dataset a real raw-record export would stream into from the environment
 * (Cloud Run env vars at deploy time, per `infra/terraform/bigquery.tf`'s `growthos_raw` dataset).
 * Reuses `GOOGLE_CLOUD_PROJECT`/`GCLOUD_PROJECT` — the same project-id env vars
 * `query-executor.ts`'s `readWarehouseEnvConfig` already reads for the same reason (what
 * `@google-cloud/bigquery` itself recognizes for Application Default Credentials) —
 * plus a new, GrowthOS-specific `GROWTHOS_BIGQUERY_RAW_DATASET`, deliberately separate from
 * `GROWTHOS_BIGQUERY_CORE_DATASET` since the raw and core datasets are provisioned (and could be
 * configured) independently.
 */
export function readWarehouseSinkEnvConfig(env: NodeJS.ProcessEnv = process.env): WarehouseSinkEnvConfig {
  return {
    projectId: env.GOOGLE_CLOUD_PROJECT ?? env.GCLOUD_PROJECT ?? undefined,
    dataset: env.GROWTHOS_BIGQUERY_RAW_DATASET ?? undefined,
  };
}

/**
 * The env-driven factory behind {@link defaultWarehouseSink}: returns a {@link DualWarehouseSink}
 * (Firestore + a real {@link BigQueryRawRecordSink}) once a project id *and* a dataset are both
 * configured, otherwise the plain {@link FirestoreWarehouseSink} every environment has used until
 * now. Exported separately so a test can exercise the "configured" branch against a fake env object
 * without mutating real `process.env` or needing real GCP credentials.
 */
export function resolveWarehouseSinkFromEnv(env: NodeJS.ProcessEnv = process.env): WarehouseSink {
  const config = readWarehouseSinkEnvConfig(env);
  const firestoreSink = new FirestoreWarehouseSink();
  if (!config.projectId || !config.dataset) {
    return firestoreSink;
  }
  const bigQuerySink = new BigQueryRawRecordSink({
    client: createRealBigQueryInsertClient(config.projectId),
    dataset: config.dataset,
  });
  return new DualWarehouseSink(firestoreSink, bigQuerySink);
}

/**
 * Resolved once at module load from real `process.env` — every environment today (including CI) has
 * no `GROWTHOS_BIGQUERY_RAW_DATASET` set, so this stays the plain {@link FirestoreWarehouseSink}
 * until KAN-18's `infra/terraform/bigquery.tf` is applied and a deploy sets the two env vars
 * {@link readWarehouseSinkEnvConfig} reads. Frozen at import time rather than re-read per call,
 * matching `defaultWarehouseQueryExecutor`'s own posture (`warehouse/query-executor.ts`).
 */
export const defaultWarehouseSink: WarehouseSink = resolveWarehouseSinkFromEnv();
