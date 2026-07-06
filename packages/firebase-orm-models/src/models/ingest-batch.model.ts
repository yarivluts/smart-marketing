import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { SchemaDefKind } from './schema-def.model';

/**
 * One accepted `POST /v1/ingest/(events|entities|measures)` submission
 * (KAN-32: plan `13 §E3.2`/`12 §2`). Batches are processed synchronously —
 * there is no async pipeline yet (that's KAN-33) — so counts are final the
 * moment this document is written, not eventually consistent.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/ingest_batches',
  path_id: 'ingest_batch_id',
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
  public submitted_count!: number;

  @Field({ is_required: true })
  public accepted_count!: number;

  @Field({ is_required: true })
  public quarantined_count!: number;

  @Field({ is_required: true })
  public duplicate_count!: number;

  @Field({ is_required: true })
  public created_at!: string;
}
