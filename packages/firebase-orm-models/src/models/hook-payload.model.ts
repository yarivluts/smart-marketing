import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * Whether an inbound payload's `X-GrowthOS-Signature` header (if any) matched the hook
 * endpoint's signing secret. `not_configured` means the endpoint's `signature_mode` is
 * `none`, so no check was attempted — recorded rather than left implicit so the review queue
 * can distinguish "nothing to verify" from "verification was skipped".
 */
export const HOOK_PAYLOAD_SIGNATURE_STATUSES = ['verified', 'invalid', 'missing', 'not_configured'] as const;
export type HookPayloadSignatureStatus = (typeof HOOK_PAYLOAD_SIGNATURE_STATUSES)[number];

/**
 * `pending_review`: sitting in the review queue, unmapped (KAN-53 has no mapping engine yet —
 * that's KAN-54 — so every received payload starts here regardless of its signature status).
 * `dismissed`: a human reviewed it and chose not to act on it. There is no `mapped`/`accepted`
 * status yet; once KAN-54 lands, replaying a payload through a saved mapping is a new action
 * on top of this queue, the same way KAN-34's replay sits on top of KAN-32's quarantine.
 */
export const HOOK_PAYLOAD_STATUSES = ['pending_review', 'dismissed'] as const;
export type HookPayloadStatus = (typeof HOOK_PAYLOAD_STATUSES)[number];

/**
 * One inbound webhook request's durable, verbatim record (KAN-53 AC: "unknown payloads
 * visible in queue, nothing lost"). Every request to a live `HookEndpointModel` is persisted
 * here regardless of its signature outcome — a failed/missing signature quarantines the
 * payload for review rather than dropping it, the same "quarantine, don't drop" posture
 * `ingest.service.ts` and the Stripe webhook path already establish.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/hook_payloads',
  path_id: 'hook_payload_id',
})
export class HookPayloadModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public environment_id!: string;

  @Field({ is_required: true })
  public hook_endpoint_id!: string;

  @Field({ is_required: true })
  public headers!: Record<string, string>;

  @Field({ is_required: true })
  public raw_body!: string;

  @Field({ is_required: true })
  public signature_status!: HookPayloadSignatureStatus;

  @Field({ is_required: true })
  public status!: HookPayloadStatus;

  @Field({ is_required: true })
  public received_at!: string;

  @Field({ is_required: false })
  public reviewed_at?: string;

  @Field({ is_required: false })
  public reviewed_by?: string;
}
