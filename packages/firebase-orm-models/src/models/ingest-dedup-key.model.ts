import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { SchemaDefKind } from './schema-def.model';

/**
 * One claimed idempotency key: `(environment, kind, client-supplied id)` —
 * plan `08 §3.1`/`12 §2.1`'s "idempotent (client `event_id` dedup)". The
 * document id itself *is* the dedup key (a SHA-256 hash of
 * `environment_id:kind:client_id`, not the raw client id) so a duplicate
 * submission is a single point lookup by id, not a query — the efficient
 * shape the 1k-events/s load-test AC (`13 §E3.2`) needs, and it sidesteps a
 * client-supplied id containing characters Firestore document ids reject.
 * `client_id`/`batch_id` are still stored as plain fields for the
 * human-readable audit trail a hash-only id would otherwise lose.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/ingest_dedup_keys',
  path_id: 'dedup_key_id',
})
export class IngestDedupKeyModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public environment_id!: string;

  @Field({ is_required: true })
  public kind!: SchemaDefKind;

  @Field({ is_required: true })
  public client_id!: string;

  @Field({ is_required: true })
  public batch_id!: string;

  @Field({ is_required: true })
  public created_at!: string;
}
