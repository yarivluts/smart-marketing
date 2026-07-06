import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { SchemaDefKind } from './schema-def.model';

/**
 * `accepted`: valid against the active schema and not a duplicate.
 * `quarantined`: no active schema registered, or failed field validation.
 * `duplicate`: the same `client_record_id` was already `accepted` before
 * (in this batch or an earlier one) — not re-processed (KAN-32 AC:
 * "duplicate event_id deduped").
 */
export const INGEST_RECORD_STATUSES = ['accepted', 'quarantined', 'duplicate'] as const;
export type IngestRecordStatus = (typeof INGEST_RECORD_STATUSES)[number];

/**
 * One record within an ingest batch, and the outcome of validating it
 * (KAN-32: plan `13 §E3.2`'s "per-record results" endpoint). `payload` keeps
 * the original submitted data so a future quarantine/replay flow (KAN-34)
 * has something to replay once a schema is fixed.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/ingest_records',
  path_id: 'ingest_record_id',
})
export class IngestRecordModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public environment_id!: string;

  @Field({ is_required: true })
  public batch_id!: string;

  @Field({ is_required: true })
  public kind!: SchemaDefKind;

  /** The schema family name this record was validated against: an event name, entity type, or measure name. */
  @Field({ is_required: true })
  public name!: string;

  /** Client-supplied idempotency key (`event_id` for events, `id` for entities, a derived key for measures). */
  @Field({ is_required: true })
  public client_record_id!: string;

  @Field({ is_required: true })
  public status!: IngestRecordStatus;

  @Field({ is_required: true })
  public reasons!: string[];

  @Field({ is_required: true })
  public payload!: Record<string, unknown>;

  @Field({ is_required: true })
  public created_at!: string;
}
