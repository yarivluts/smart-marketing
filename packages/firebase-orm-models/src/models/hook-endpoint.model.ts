import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { SecretEnvelope } from '../vault/envelope';

/**
 * `none`: the opaque `hook_id` in the receive URL is the only credential — the
 * "point your webhook here, done" zero-config path the plan doc describes.
 * `hmac_sha256`: the sender must also sign the raw request body with a shared
 * secret; `signature_header_name` says which request header carries the
 * digest (providers disagree on the header name — GitHub's `X-Hub-Signature-256`,
 * Shopify's `X-Shopify-Hmac-Sha256`, etc. — so it's per-endpoint configurable
 * rather than hard-coded to one provider's convention).
 */
export const HOOK_SIGNATURE_MODES = ['none', 'hmac_sha256'] as const;
export type HookSignatureMode = (typeof HOOK_SIGNATURE_MODES)[number];

/**
 * A per-project+environment inbound webhook receiver (KAN-53, E9.1: plan
 * `08 §3.2`/`12 §2.4` — "any SaaS that can fire webhooks... gets a per-project
 * inbound webhook URL"). `hook_id` is a random, unguessable token (not the
 * document id) embedded in the public receive URL — looked up the same way
 * `ApiKeyModel.hashed_secret` is (a collection-group query by value, not a
 * path lookup), since the receiver endpoint knows nothing about org/project
 * ahead of time, only the token in the URL.
 *
 * `signing_secret_encrypted` reuses the KAN-29 vault envelope format (the
 * same `encryptSecret`/`decryptSecret` pair `SharedCredentialModel` uses),
 * bound to this document's own id so it can never be decrypted under a
 * different endpoint's binding.
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

  @Field({ is_required: true })
  public environment_id!: string;

  /** Random URL-safe token embedded in the public `POST /v1/hooks/:hookId` receive URL. */
  @Field({ is_required: true })
  public hook_id!: string;

  @Field({ is_required: true })
  public signature_mode!: HookSignatureMode;

  /** Required when `signature_mode === 'hmac_sha256'`, e.g. `X-Hub-Signature-256`. */
  @Field()
  public signature_header_name?: string;

  /** Envelope-encrypted HMAC signing secret (KAN-29 vault). Unset when `signature_mode === 'none'`. */
  @Field()
  public signing_secret_encrypted?: SecretEnvelope;

  @Field({ is_required: true })
  public created_by!: string;

  @Field({ is_required: true })
  public created_at!: string;

  /** Presence alone means the endpoint is dead — a disabled endpoint's receive URL 404s, the same immediate-revocation posture `ApiKeyModel.revoked_at` establishes. */
  @Field()
  public disabled_at?: string;

  @Field()
  public disabled_by?: string;
}
