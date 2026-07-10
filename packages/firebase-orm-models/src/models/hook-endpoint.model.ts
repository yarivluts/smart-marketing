import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { SecretEnvelope } from '../vault';

/**
 * How an inbound webhook's authenticity is checked (KAN-53, plan `12 §2.4`/`08 §3.2`):
 * `none` accepts any payload with no verification (the zero-config default so a
 * new integration can be pointed here immediately); `hmac_sha256` requires an
 * `X-GrowthOS-Signature: sha256=<hex>` header matching `HMAC-SHA256(secret, rawBody)`,
 * the scheme plan `12 §1` documents for signed requests generally.
 */
export const HOOK_SIGNATURE_MODES = ['none', 'hmac_sha256'] as const;
export type HookSignatureMode = (typeof HOOK_SIGNATURE_MODES)[number];

export function isHookSignatureMode(value: string): value is HookSignatureMode {
  return (HOOK_SIGNATURE_MODES as readonly string[]).includes(value);
}

/**
 * A per-project inbound webhook endpoint (KAN-53: plan `13 §E9.1`, spec `12 §2.4`/`08 §3.2`) —
 * "point any SaaS webhook here". Its own document id (`hook_endpoint_id`) is the `{hook_id}`
 * segment of `POST /v1/hooks/{project}/{hook_id}`; the route resolves org/project purely from
 * this model (looked up by id across the `hook_endpoints` collection group, the same
 * bearer-key-free pattern `authenticateApiKey` established for KAN-32's flat ingest routes),
 * since the caller is an external SaaS with no GrowthOS credential of its own.
 *
 * Unlike `ApiKeyModel.hashed_secret`, a `hmac_sha256` signing secret can't be hash-only stored
 * — HMAC verification needs the plaintext at request time — so it's envelope-encrypted (KAN-29)
 * instead, the same tradeoff `SharedCredentialModel.encrypted_secret` makes for OAuth/API
 * secrets that must be read back, not just compared against.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/hook_endpoints',
  path_id: 'hook_endpoint_id',
})
export class HookEndpointModel extends BaseModel {
  @Field({ is_required: true, is_text_indexing: true })
  public name!: string;

  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  /** Id of the `EnvironmentModel` this hook's payloads are attributed to. */
  @Field({ is_required: true })
  public environment_id!: string;

  @Field({ is_required: true })
  public signature_mode!: HookSignatureMode;

  /** Present only when `signature_mode` is `hmac_sha256`. */
  @Field({ is_required: false })
  public encrypted_signing_secret?: SecretEnvelope;

  @Field({ is_required: true })
  public created_by!: string;

  @Field({ is_required: true })
  public created_at!: string;

  /** Set the moment this endpoint is revoked; its presence alone means further payloads to it are rejected — same immediate-revocation posture as `ApiKeyModel.revoked_at`. */
  @Field({ is_required: false })
  public revoked_at?: string;

  @Field({ is_required: false })
  public revoked_by?: string;
}
