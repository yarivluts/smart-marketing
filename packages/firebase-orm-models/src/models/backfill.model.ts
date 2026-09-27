import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { SecretEnvelope } from '../vault/envelope';
import type { SchemaDefKind } from './schema-def.model';

/** One schema a backfill asks the integrator to resend. */
export interface BackfillSchemaRef {
  kind: SchemaDefKind;
  name: string;
}

/**
 * Where GrowthOS asks an integrator to resend its existing records, for one project environment.
 *
 * Integrators send an entity only when it changes, so on the day an integration goes live every
 * pre-existing customer is missing until it happens to change. A backfill endpoint closes that gap:
 * GrowthOS POSTs a signed `backfill.requested` to `url` (Standard Webhooks), and the integrator
 * pages its records through the normal ingest API tagged with the backfill id. One endpoint per
 * environment: the document id is the environment id.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/backfill_endpoints',
  path_id: 'backfill_endpoint_id',
})
export class BackfillEndpointModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public environment_id!: string;

  /** Validated https URL on a public address (see `assertPublicHttpsUrl`). */
  @Field({ is_required: true })
  public url!: string;

  /** The schemas a request covers when it names none. */
  @Field({ is_required: true })
  public schemas!: BackfillSchemaRef[];

  /** The Standard Webhooks signing secret, envelope-encrypted with the vault; returned in clear exactly once. */
  @Field({ is_required: true })
  public signing_secret_encrypted!: SecretEnvelope;

  @Field({ is_required: true })
  public created_by!: string;

  /** Not `created_at`/`updated_at`: the ORM auto-stamps those names with epoch numbers. */
  @Field({ is_required: true })
  public registered_at!: string;

  @Field({ is_required: true })
  public last_changed_at!: string;
}

export const BACKFILL_STATUSES = ['requested', 'delivered', 'receiving', 'completed', 'failed'] as const;
export type BackfillStatus = (typeof BACKFILL_STATUSES)[number];

/** What the integrator reported when it finished (`POST /v1/backfills/{id}/complete`). */
export interface BackfillCompletionReport {
  records_sent: number;
  batches: number;
  errors?: { message: string }[];
}

/**
 * One backfill request and its progress: requested -> delivered (the endpoint answered 2xx) ->
 * receiving (the first tagged ingest batch arrived) -> completed | failed.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/backfills',
  path_id: 'backfill_id',
})
export class BackfillRequestModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public environment_id!: string;

  @Field({ is_required: true })
  public schemas!: BackfillSchemaRef[];

  @Field({ is_required: true })
  public status!: BackfillStatus;

  @Field({ is_required: true })
  public requested_by!: string;

  @Field({ is_required: true })
  public requested_at!: string;

  /** The Standard Webhooks `webhook-id`, identical on every retry so the endpoint can dedup. */
  @Field({ is_required: true })
  public webhook_id!: string;

  @Field({ is_required: true })
  public delivery_attempts!: number;

  @Field()
  public last_http_status?: number;

  @Field()
  public delivered_at?: string;

  @Field()
  public first_batch_at?: string;

  @Field()
  public completed_at?: string;

  @Field()
  public report?: BackfillCompletionReport;

  /** Why the request failed: a delivery error, a 4xx, or the integrator's own failed report. */
  @Field()
  public failure_reason?: string;
}
