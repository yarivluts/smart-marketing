import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { SchemaDefKind } from './schema-def.model';

/**
 * `quarantined`: still needs a schema fix (or a corrected payload) before it can be replayed.
 * `replayed`: a replay attempt (KAN-34) has resolved this record — either it was accepted into the
 * pipeline, or it turned out to be a duplicate of an already-accepted record. A replay that still
 * fails leaves the record `quarantined` (with its `reasons` refreshed), not `replayed`.
 * `dismissed`: a deliberate "won't fix" (KAN-131) — an operator decided this record will never
 * validate (an abandoned integration's payload, a one-off malformed test event) and isn't worth
 * evolving the schema to accommodate, so it's discarded without ever being replayed. Same terminal,
 * one-way posture as `replayed` — there is no `undismiss`, matching this model's own precedent that
 * once a record leaves `quarantined` it does not come back.
 */
export const QUARANTINED_RECORD_STATUSES = ['quarantined', 'replayed', 'dismissed'] as const;
export type QuarantinedRecordStatus = (typeof QUARANTINED_RECORD_STATUSES)[number];

/**
 * A quarantined ingest record's durable home (KAN-34: plan `13 §E3.4` "Invalid records land in
 * quarantine with reason; replay after schema fix succeeds"). Before this model existed,
 * `IngestBatchModel.record_results` recorded only a quarantined record's validation outcome
 * (`status`/`reasons`), never its raw payload — so there was nothing to resubmit once a schema was
 * fixed. This model persists the full raw record (the same envelope `ingestBatch` would have
 * published to the pipeline had it been accepted) alongside why it was rejected, so
 * `replayQuarantinedRecord` (`quarantine.service.ts`) has something to re-validate and, on success,
 * something to publish.
 *
 * Written best-effort from `ingestBatch`, the same tradeoff as its dedup-key claims and pipeline
 * publish: a write failure here never turns an otherwise-successful 202 into a 500, it just means
 * that one record has no durable quarantine entry to replay later (still visible via
 * `IngestBatchModel.record_results` for diagnostics, just not replayable).
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/quarantined_records',
  path_id: 'quarantined_record_id',
})
export class QuarantinedRecordModel extends BaseModel {
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

  @Field({ is_required: true })
  public schema_name!: string;

  @Field({ is_required: true })
  public client_id!: string;

  @Field({ is_required: true })
  public payload!: Record<string, unknown>;

  @Field({ is_required: true })
  public reasons!: string[];

  @Field({ is_required: true })
  public status!: QuarantinedRecordStatus;

  @Field({ is_required: true })
  public created_at!: string;

  @Field({ is_required: false })
  public replayed_at?: string;

  /** Set together with `status: 'dismissed'` (KAN-131) — when this record was permanently discarded without replay. */
  @Field({ is_required: false })
  public dismissed_at?: string;

  /** The user who dismissed this record (KAN-131) — kept alongside `dismissed_at` for the same audit-trail reasons `replayed_at` alone doesn't name who acted, only when. */
  @Field({ is_required: false })
  public dismissed_by_user_id?: string;
}
