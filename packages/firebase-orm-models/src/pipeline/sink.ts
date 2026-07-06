import { RawRecordModel } from '../models/raw-record.model';
import type { SchemaDefKind } from '../models/schema-def.model';

export interface WarehouseRawRow {
  organizationId: string;
  projectId: string;
  environmentId: string;
  batchId: string;
  kind: SchemaDefKind;
  schemaName: string;
  clientId: string;
  payload: Record<string, unknown>;
}

/**
 * The "land a record in the warehouse" boundary (KAN-33, plan `13 §E3.3`). Stands in for a real
 * partitioned BigQuery raw table until KAN-18/KAN-37 provision one — a `BigQueryWarehouseSink`
 * streaming-inserting into `org/project/env/date`-partitioned tables is a drop-in swap behind this
 * same interface.
 *
 * `id` is the source `PipelineMessageModel`'s own id, so a caller landing the same message twice
 * (a transient retry, or a future KAN-34 replay) overwrites the same row instead of duplicating it —
 * "at least once delivery, idempotent consumer".
 */
export interface WarehouseSink {
  insertRawRecord(row: WarehouseRawRow, id: string): Promise<void>;
}

export class FirestoreWarehouseSink implements WarehouseSink {
  async insertRawRecord(row: WarehouseRawRow, id: string): Promise<void> {
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

export const defaultWarehouseSink: WarehouseSink = new FirestoreWarehouseSink();
