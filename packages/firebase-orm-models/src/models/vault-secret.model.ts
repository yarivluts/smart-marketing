import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { SealedPayload, WrappedDataKey } from '../vault';

/**
 * An envelope-encrypted secret (OAuth token, webhook signing secret, ...)
 * belonging to some other org-scoped record (`owner_type`/`owner_id` — e.g. a
 * future `SharedCredentialModel` attachment, same polymorphic-owner shape
 * `ResourceAttachmentModel` already uses for `resource_kind`/`resource_id`).
 * KAN-29: only ever stores ciphertext plus a KMS-wrapped data key, never the
 * plaintext or an unwrapped data key, so a raw Firestore read/export/backup
 * can never recover the secret on its own — only a caller holding both this
 * document *and* the org's per-tenant KMS key (`vault.service.ts`'s
 * `KmsProvider`) can. See `vault.service.ts` for the envelope-encryption and
 * rotation mechanics.
 */
@Model({
  reference_path: 'organizations/:organization_id/vault_secrets',
  path_id: 'vault_secret_id',
})
export class VaultSecretModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  /** What kind of record this secret belongs to, e.g. `'shared_credential'`. */
  @Field({ is_required: true })
  public owner_type!: string;

  /** Id of the owning record within `owner_type`. */
  @Field({ is_required: true })
  public owner_id!: string;

  /** The secret's ciphertext under its own random per-secret data key. */
  @Field({ is_required: true })
  public sealed_secret!: SealedPayload;

  /** That data key, itself encrypted ("wrapped") under the org's current KMS key. */
  @Field({ is_required: true })
  public wrapped_data_key!: WrappedDataKey;

  @Field({ is_required: true })
  public created_by!: string;

  /** Set on every successful `rotateVaultSecret` call — records when the KEK protecting this secret was last rotated. */
  @Field()
  public rotated_at?: string;
}
