import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { SchemaDefKind } from './schema-def.model';

/**
 * `accepted`: validated against the project's active schema for its kind/name
 * and (for events/entities) not a repeat of an already-claimed client id.
 * `quarantined`: failed envelope or schema validation — plan `08 §2`/`12
 * §2.1`: "unknown fields are quarantined, not dropped". `duplicate`: the
 * record's client-supplied id (or, for measures, its natural key) was already
 * claimed by an earlier accepted record — plan `12 §2.1`'s "idempotent
 * (client `event_id` dedup)".
 */
export const INGEST_RECORD_STATUSES = ['accepted', 'quarantined', 'duplicate'] as const;
export type IngestRecordStatus = (typeof INGEST_RECORD_STATUSES)[number];

export interface IngestRecordResult {
  client_id: string;
  status: IngestRecordStatus;
  reasons?: string[];
}

/**
 * One batch submitted to `POST /v1/ingest/(events|entities|measures)` (plan
 * `12 §2.1`: "202-accepted ... async validation results queryable per
 * batch"). Persists every record's individual outcome, not just a summary
 * count, so `GET /v1/ingest/batches/{batch_id}` can return per-record results
 * (KAN-32 AC). Named `record_results`, not `results`/`records`, to read
 * clearly next to the summary count fields below — no `@arbel/firebase-orm`
 * naming collision risk here (that only applies to the literal name
 * `fields`, per `SchemaDefModel`'s `field_defs`).
 *
 * This is validation bookkeeping, not the accepted record's own durable home:
 * `record_results` stores each record's outcome, not its payload. The payload
 * itself lands in `PipelineMessageModel`/`RawRecordModel` (KAN-33's pipeline) —
 * each keyed by its own generated id, queryable back to this batch via their
 * own `batch_id` field, not this model's id.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/ingest_batches',
  path_id: 'batch_id',
})
export class IngestBatchModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public environment_id!: string;

  @Field({ is_required: true })
  public kind!: SchemaDefKind;

  @Field({ is_required: true })
  public total_count!: number;

  @Field({ is_required: true })
  public accepted_count!: number;

  @Field({ is_required: true })
  public quarantined_count!: number;

  @Field({ is_required: true })
  public duplicate_count!: number;

  @Field({ is_required: true })
  public record_results!: IngestRecordResult[];

  @Field({ is_required: true })
  public created_at!: string;
}
