import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { SecretEnvelope } from '../vault';

/** An ad account the connecting person can use, as Meta listed it at connect time. */
export interface MetaOAuthAdAccount {
  /** Numeric id without the `act_` prefix. */
  id: string;
  name: string;
  currency: string | null;
  /** Meta's `account_status` (1 = active). */
  status: number | null;
}

/** A Facebook Page the connecting person can advertise as. */
export interface MetaOAuthPage {
  id: string;
  name: string;
}

export const META_OAUTH_SESSION_STATUSES = ['started', 'authorized'] as const;
export type MetaOAuthSessionStatus = (typeof META_OAUTH_SESSION_STATUSES)[number];

/**
 * One "Connect with Facebook" attempt: started by a person who holds `resources.manage`, carried
 * through Meta's consent dialog by an opaque `state`, and finished when that same person picks the
 * ad account and Page to connect. Top-level (the callback only knows the `state`), looked up by the
 * state's hash - the raw state is never stored, the same posture `McpOAuthGrantModel` takes for codes.
 *
 * Between Meta's callback and the pick, the long-lived user token waits here sealed with the vault
 * (`encrypted_token`, bound to this session) and never in plain text. A session is single-use and
 * short-lived: finishing it deletes it, and an expired one is refused.
 */
@Model({
  reference_path: 'meta_oauth_sessions',
  path_id: 'meta_oauth_session_id',
})
export class MetaOAuthSessionModel extends BaseModel {
  @Field({ is_required: true })
  public state_hash!: string;

  @Field({ is_required: true })
  public organization_id!: string;

  /** The project to attach the connection to (the one the person started from), if any. */
  @Field()
  public project_id?: string | null;

  /** Only this user may complete the session. */
  @Field({ is_required: true })
  public user_id!: string;

  /** Where to send the person back to after connecting, as an app-relative path. */
  @Field()
  public return_to?: string | null;

  @Field({ is_required: true })
  public locale!: string;

  @Field({ is_required: true })
  public status!: MetaOAuthSessionStatus;

  @Field({ is_required: true })
  public created_on!: string;

  @Field({ is_required: true })
  public expires_on!: string;

  @Field()
  public encrypted_token?: SecretEnvelope | null;

  /** When the long-lived token expires; null means Meta reported no expiry. */
  @Field()
  public token_expires_on?: string | null;

  @Field()
  public ad_accounts?: MetaOAuthAdAccount[] | null;

  @Field()
  public pages?: MetaOAuthPage[] | null;
}
