import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { SchemaDefKind } from './schema-def.model';

/**
 * One record landed in the warehouse's raw layer (KAN-33: plan `13 §E3.3` "BigQuery raw tables
 * partitioned by `org/project/env/date`"). Firestore stands in for a real partitioned BigQuery table
 * until KAN-18/KAN-37 provision one — `partition_date` is the column a real table would partition on.
 * Keyed by its source `PipelineMessageModel`'s own id (see `pipeline/sink.ts`), so re-landing the same
 * message (a transient retry, or a future KAN-34 replay) is an idempotent overwrite, not a duplicate
 * row.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/raw_records',
  path_id: 'raw_record_id',
})
export class RawRecordModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public environment_id!: string;

  @Field({ is_required: true })
  public partition_date!: string;

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
  public landed_at!: string;
}
