import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * `pending`: sitting in the review queue, untouched.
 * `reviewed`: a human has looked at it, either by hand (`setHookDeliveryStatus`)
 * or because `field-mapping.service.ts`'s `applyFieldMappingToDelivery` (KAN-54
 * follow-up) actually mapped and landed it — see `applied_at`/`applied_by`/
 * `applied_field_mapping_id`/`applied_batch_id` below for which of the two
 * happened, and whether the record made it into the ingest pipeline.
 * `discarded`: a human decided this payload doesn't need mapping (test pings,
 * noise) and cleared it from the active queue view.
 */
export const HOOK_DELIVERY_STATUSES = ['pending', 'reviewed', 'discarded'] as const;
export type HookDeliveryStatus = (typeof HOOK_DELIVERY_STATUSES)[number];

/**
 * One raw inbound webhook delivery (KAN-53 AC: "store raw payload... unknown
 * payloads visible in queue, nothing lost"). Persisted verbatim — the exact
 * bytes the sender posted — *before* any interpretation, since there is no
 * mapping layer yet to interpret it into (that's KAN-54). `headers` keeps
 * only the subset useful for later mapping/debugging (content type + the
 * sender's own event/type hints some SaaS webhooks include), not the full
 * header set, so nothing transport-layer-sensitive (cookies, forwarded-auth
 * headers a proxy may have injected) is captured through a URL third parties
 * post directly to.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/hook_deliveries',
  path_id: 'hook_delivery_id',
})
export class HookDeliveryModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public environment_id!: string;

  @Field({ is_required: true })
  public hook_endpoint_id!: string;

  @Field({ is_required: true })
  public raw_payload!: string;

  @Field({ is_required: true })
  public headers!: Record<string, string>;

  @Field({ is_required: true })
  public signature_verified!: boolean;

  @Field({ is_required: true })
  public status!: HookDeliveryStatus;

  @Field({ is_required: true })
  public received_at!: string;

  @Field()
  public reviewed_at?: string;

  @Field()
  public reviewed_by?: string;

  /** Set together, all-or-nothing, only once `applyFieldMappingToDelivery` actually lands this delivery's mapped record via `ingestBatch` — presence alone means "this delivery was mapped and ingested for real", not just previewed via a test-run. */
  @Field()
  public applied_at?: string;

  @Field()
  public applied_by?: string;

  /** Which saved `FieldMappingModel` produced the record that landed — kept even if that mapping is later disabled or its rules change. */
  @Field()
  public applied_field_mapping_id?: string;

  /** The `IngestBatchModel` this delivery's mapped record landed in (KAN-32/33) — lets an admin trace a delivery all the way to its accept/quarantine/duplicate outcome. */
  @Field()
  public applied_batch_id?: string;
}
