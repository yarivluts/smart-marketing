import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * Providers a shared credential can represent. Kept intentionally small and
 * generic — real OAuth flows for these providers land with their own
 * connector stories (KAN-49/50/51); `generic` covers anything pushed in
 * manually (e.g. a CRM API key) ahead of a dedicated plugin existing.
 */
export const CREDENTIAL_PROVIDERS = ['google_ads', 'meta_ads', 'generic'] as const;
export type CredentialProvider = (typeof CREDENTIAL_PROVIDERS)[number];

export function isCredentialProvider(value: string): value is CredentialProvider {
  return (CREDENTIAL_PROVIDERS as readonly string[]).includes(value);
}

/**
 * An org-level connection credential in the Org Resource Library (plan 08
 * §1.2), e.g. one Google Ads MCC or Meta Business Manager login serving
 * several projects. Deliberately holds no secret/token material: real
 * envelope-encrypted secret storage is KAN-29 (KMS vault module), which does
 * not exist yet, so this model only tracks the credential's identity and the
 * org-level slice of sub-accounts it can grant (`available_scopes`) — the
 * part of KAN-27 that's buildable without KMS. Wiring an actual OAuth token
 * into this model is a follow-up once KAN-29 lands.
 */
@Model({
  reference_path: 'organizations/:organization_id/shared_credentials',
  path_id: 'shared_credential_id',
})
export class SharedCredentialModel extends BaseModel {
  @Field({ is_required: true, is_text_indexing: true })
  public name!: string;

  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public provider!: CredentialProvider;

  /**
   * The full set of sub-accounts (e.g. ad account ids) this credential can
   * see at the org level. A project attaching this credential selects a
   * subset via `ResourceAttachmentModel.scope_selection` — it must never see
   * entries outside this list, and never a sibling project's own subset.
   */
  @Field()
  public available_scopes?: string[];

  @Field({ is_required: true })
  public created_by!: string;
}
