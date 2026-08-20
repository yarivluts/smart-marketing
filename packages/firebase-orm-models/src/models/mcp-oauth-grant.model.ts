import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * One user's OAuth grant of one MCP client to one project (KAN-75, plan
 * `12 §6.1`). Top-level collection, the same "created before any org/project
 * scoping is meaningful to query by" reasoning `TvPairingModel` documents —
 * except here the doc is only ever created *after* an authenticated human
 * has already picked the org/project at consent time (`mcp-oauth.service.ts`'s
 * `issueMcpAuthorizationCode`), so `organization_id`/`project_id` are set
 * from the very first write, unlike a TV pairing's two-phase claim.
 *
 * One doc carries the entire authorization-code -> access/refresh-token
 * lifecycle as evolving state (mirrors `TvPairingModel`'s single-secret-
 * lifecycle shape rather than three separate models for code/access/refresh):
 * `code_hash` is minted at consent time and single-use (`code_redeemed_at`);
 * redeeming it at the token endpoint mints `access_token_hash` +
 * `refresh_token_hash` on this same doc; a refresh rotates both in place.
 * Only the hash of each live secret is ever persisted — the same "the raw
 * value only exists transiently, at mint/rotate time" posture `ApiKeyModel`
 * and `TvPairingModel` already establish.
 */
@Model({
  reference_path: 'mcp_oauth_grants',
  path_id: 'mcp_oauth_grant_id',
})
export class McpOAuthGrantModel extends BaseModel {
  @Field({ is_required: true })
  public client_id!: string;

  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  /** The human who approved this grant on the consent page — every MCP tool call authenticated through this grant is re-checked against *this* user's *current* role bindings (see `mcp-oauth.service.ts`'s `resolveMcpOAuthPrincipal`), not a snapshot taken at consent time. */
  @Field({ is_required: true })
  public granted_by_user_id!: string;

  /** OAuth scope string granted, e.g. `mcp:read` (plan `12 §6.1`'s own vocabulary) — kept as the literal client-facing scope string rather than the internal dotted `Permission` name (`mcp.read`) it maps to, since this field is echoed back in token responses. */
  @Field({ is_required: true })
  public scope!: string;

  @Field({ is_required: true })
  public redirect_uri!: string;

  @Field({ is_required: true })
  public code_challenge!: string;

  @Field({ is_required: true })
  public code_challenge_method!: string;

  @Field({ is_required: true })
  public code_hash!: string;

  @Field({ is_required: true })
  public code_expires_at!: string;

  /** Set the instant the authorization code is redeemed at `/oauth/token` — presence alone makes the code single-use (a second redemption attempt is rejected, same as an already-claimed `TvPairingModel` code). */
  @Field()
  public code_redeemed_at?: string;

  @Field()
  public access_token_hash?: string;

  @Field()
  public access_token_expires_at?: string;

  @Field()
  public refresh_token_hash?: string;

  @Field()
  public refresh_token_expires_at?: string;

  /**
   * Every refresh-token hash this grant has ever rotated *out of* — appended
   * to (never removed from) on each rotation in `mintTokenPair`, right
   * before `refresh_token_hash` is overwritten with the newly-minted one.
   * `refreshMcpAccessToken` checks a presented token against this array
   * whenever it isn't the current live one: a match means someone is
   * replaying a refresh token that was already rotated away, the classic
   * OAuth 2.1 §4.3.1 "refresh token reuse" theft signal, and the whole grant
   * is revoked immediately rather than just rejecting that one request.
   * Unbounded growth is not a practical concern: an access token is only
   * good for an hour, so even a client that refreshes every single time it
   * expires accrues on the order of a few hundred entries before the
   * refresh token's own 30-day TTL ends the grant's rotation history.
   */
  @Field()
  public used_refresh_token_hashes?: string[];

  @Field({ is_required: true })
  public created_at!: string;

  @Field()
  public last_used_at?: string;

  /** Presence alone revokes the grant immediately, regardless of token/refresh expiry — the same "revocation is a field, not a delete, and is immediate" posture `ApiKeyModel.revoked_at` documents. */
  @Field()
  public revoked_at?: string;

  @Field()
  public revoked_by?: string;
}
