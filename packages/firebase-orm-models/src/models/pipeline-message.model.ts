import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { SchemaDefKind } from './schema-def.model';

export const PIPELINE_MESSAGE_STATUSES = ['queued', 'delivered', 'failed'] as const;
export type PipelineMessageStatus = (typeof PIPELINE_MESSAGE_STATUSES)[number];

/**
 * One accepted ingest record queued for the warehouse-landing pipeline (KAN-33: plan `13 §E3.3`
 * "accepted records -> Pub/Sub -> BigQuery raw tables"). Firestore is the durable outbox standing in
 * for a real Pub/Sub topic (plan `08 §generic-platform`: "native Pub/Sub/Kafka topic per project")
 * until KAN-18 provisions one — `pipeline/transport.ts`'s `PipelineTransport` interface is the seam a
 * `GcpPubSubTransport` would slot into without this model changing. Also the first place an accepted
 * record's full raw payload is persisted anywhere durable — KAN-32's own `IngestBatchModel` only ever
 * stored per-record validation status, not the payload.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/pipeline_messages',
  path_id: 'message_id',
})
export class PipelineMessageModel extends BaseModel {
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
  public status!: PipelineMessageStatus;

  @Field({ is_required: true })
  public enqueued_at!: string;

  @Field({ is_required: false })
  public delivered_at?: string;

  @Field({ is_required: false })
  public failure_reason?: string;
}
