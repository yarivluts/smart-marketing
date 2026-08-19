import { BigQuery } from '@google-cloud/bigquery';
import type { PipelineRecordEnvelope } from '../pipeline/record';
import type { WarehouseSink } from '../pipeline/sink';

/** One row as BigQuery's streaming insert (`tabledata.insertAll`) API expects it in "raw" mode — an explicit `insertId` for its own short-window best-effort dedup, plus the row body. */
export interface BigQueryInsertRow {
  insertId: string;
  json: Record<string, unknown>;
}

/**
 * The minimal slice of `@google-cloud/bigquery` this sink depends on — narrowed to "insert some rows
 * into one dataset+table", so a test can inject a fake client without a real GCP project/credentials,
 * the same "inject the client interface, not the SDK" convention `BigQueryQueryClient` already uses.
 */
export interface BigQueryInsertClient {
  insertRows(datasetId: string, tableId: string, rows: readonly BigQueryInsertRow[]): Promise<void>;
}

/** Wraps a real `@google-cloud/bigquery` `BigQuery` instance behind {@link BigQueryInsertClient}. */
export function createRealBigQueryInsertClient(projectId?: string): BigQueryInsertClient {
  const bigquery = new BigQuery(projectId ? { projectId } : undefined);
  return {
    insertRows: async (datasetId, tableId, rows) => {
      await bigquery
        .dataset(datasetId)
        .table(tableId)
        .insert(
          rows.map((row) => ({ insertId: row.insertId, json: row.json })),
          { raw: true },
        );
    },
  };
}

export interface BigQueryRawRecordSinkConfig {
  client: BigQueryInsertClient;
  /** `growthos_raw` per `infra/terraform/bigquery.tf`. */
  dataset: string;
  /** Defaults to `raw_records`, the terraform-declared table name — overridable only for tests. */
  table?: string;
}

/**
 * Streams every landed raw record into BigQuery's `raw_records` table (`infra/terraform/bigquery.tf`,
 * KAN-18 phase 3) — the real target `growthos_raw.raw_records` dataset/table that file's own doc
 * comment describes as "mirrors RawRecordModel (Firestore), exported/streamed in here per raw-record".
 * Never used standalone: `DualWarehouseSink` (see `pipeline/sink.ts`) is what actually wires this in
 * alongside the existing `FirestoreWarehouseSink`, so every admin surface reading `RawRecordModel`
 * from Firestore today (ingest health, event-volume sparklines, tracking alerts) keeps working
 * unmodified once BigQuery is configured — this sink only adds a second landing target, it doesn't
 * replace the first.
 *
 * Field-for-field mirror of that terraform table's schema. `payload` is JSON-stringified before
 * being sent: BigQuery's streaming-insert API expects a `JSON`-typed column's value pre-serialized,
 * not a nested object. `insertId` is the source `PipelineMessageModel`'s own id — the same id
 * `FirestoreWarehouseSink` keys its idempotent overwrite on — giving BigQuery's own best-effort
 * insert-time dedup the same idempotency key.
 */
export class BigQueryRawRecordSink implements WarehouseSink {
  private readonly client: BigQueryInsertClient;

  private readonly dataset: string;

  private readonly table: string;

  constructor(config: BigQueryRawRecordSinkConfig) {
    this.client = config.client;
    this.dataset = config.dataset;
    this.table = config.table ?? 'raw_records';
  }

  async insertRawRecord(row: PipelineRecordEnvelope, id: string): Promise<void> {
    const landedAt = new Date().toISOString();
    await this.client.insertRows(this.dataset, this.table, [
      {
        insertId: id,
        json: {
          raw_record_id: id,
          organization_id: row.organizationId,
          project_id: row.projectId,
          environment_id: row.environmentId,
          partition_date: landedAt.slice(0, 10),
          batch_id: row.batchId,
          kind: row.kind,
          schema_name: row.schemaName,
          client_id: row.clientId,
          payload: JSON.stringify(row.payload),
          landed_at: landedAt,
        },
      },
    ]);
  }
}
