import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * A dynamically-registered MCP OAuth client (KAN-75, RFC 7591-lite — plan
 * `12 §6.1`: "OAuth 2.1 flow for interactive clients"). Top-level collection
 * (the same shape `TvPairingModel`/`UserModel` use) since a client
 * registers itself before any org/project/user is known — it is a
 * platform-wide identity (e.g. "Claude Desktop on this machine"), not
 * scoped to a tenant.
 *
 * Always a public client per OAuth 2.1's guidance for native/desktop apps
 * (Claude Desktop, Claude Code, claude.ai's own connector redirect): no
 * `client_secret` is issued or stored — `code_verifier`/PKCE (`S256`) is the
 * only proof of possession `mcp-oauth.service.ts` requires at the token
 * endpoint.
 */
@Model({
  reference_path: 'mcp_oauth_clients',
  path_id: 'mcp_oauth_client_id',
})
export class McpOAuthClientModel extends BaseModel {
  @Field({ is_required: true, is_text_indexing: true })
  public client_name!: string;

  /** Exact-match allow-list checked at both `/oauth/authorize` and `/oauth/token` — an authorization code or token request naming a `redirect_uri` outside this list is rejected outright (OAuth 2.1 §4.1.3's open-redirect defense). */
  @Field({ is_required: true })
  public redirect_uris!: string[];

  @Field({ is_required: true })
  public created_at!: string;
}
