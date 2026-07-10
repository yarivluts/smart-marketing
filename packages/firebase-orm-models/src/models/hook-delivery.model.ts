import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * `pending`: sitting in the review queue, untouched.
 * `reviewed`: a human has looked at it. KAN-53 has no mapping engine yet
 * (that's KAN-54's E9.2) so this is bookkeeping, not a transform into a
 * registered event/entity/measure — the queue exists so "nothing lost" (the
 * E9.1 AC) is verifiable today even before there's anywhere to map into.
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
}
