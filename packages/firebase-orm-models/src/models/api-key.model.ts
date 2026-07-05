import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { ApiKeyScope } from '@growthos/shared';

/**
 * A minted API key (KAN-28: plan `12 §1` / `06 §1`), scoped to exactly one
 * project + environment. The raw secret is never stored — only its SHA-256
 * hash (`hashed_secret`), so a Firestore read (or backup, or export) can
 * never reveal a usable key; the raw value only ever exists transiently at
 * mint time (see `key.service.ts`). `key_prefix` holds a short, safe-to-
 * display slice of the raw key (its `gos_live_`/`gos_test_` prefix plus a
 * few random characters) so an admin UI can distinguish keys in a list
 * without ever showing the full secret again — the same "copy-once" pattern
 * Stripe/GitHub use for their own tokens.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/api_keys',
  path_id: 'api_key_id',
})
export class ApiKeyModel extends BaseModel {
  @Field({ is_required: true, is_text_indexing: true })
  public name!: string;

  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  /** Id of the `EnvironmentModel` this key is scoped to — wrong-environment requests must be denied (KAN-28 AC). */
  @Field({ is_required: true })
  public environment_id!: string;

  /** Display-safe slice of the raw key, e.g. `gos_live_a1b2c3d4`. Never sufficient on its own to authenticate. */
  @Field({ is_required: true })
  public key_prefix!: string;

  /** SHA-256 hex digest of the full raw key. The raw key itself is never persisted. */
  @Field({ is_required: true })
  public hashed_secret!: string;

  /** Least-privilege scope list, each a member of `API_KEY_SCOPES` (`@growthos/shared`). */
  @Field({ is_required: true })
  public scopes!: ApiKeyScope[];

  @Field({ is_required: true })
  public created_by!: string;

  @Field()
  public last_used_at?: string;

  /** Set the moment a key is revoked; its presence alone means the key is dead — revocation is immediate, not eventually-consistent (KAN-28 AC). */
  @Field()
  public revoked_at?: string;

  @Field()
  public revoked_by?: string;
}
