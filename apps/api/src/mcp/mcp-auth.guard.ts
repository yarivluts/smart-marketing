import type { IncomingMessage } from 'node:http';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { authenticateApiKey, authenticateMcpAccessToken } from '@growthos/firebase-orm-models';
import type { ApiKeyScope } from '@growthos/shared';

/** The project/principal an MCP request authenticated against, regardless of which of the two credential kinds plan `12 §6.1` allows ("OAuth 2.1 flow for interactive clients, or a scoped API key ... for headless agents") was actually presented. */
export interface McpAuthContext {
  organizationId: string;
  projectId: string;
  principalKind: 'api_key' | 'oauth';
  /** Set only for `principalKind: 'oauth'` — the human who approved the connection; tool implementations don't need it today (the policy re-check already happened in the guard), but it's useful for audit/log lines a future story might add. */
  userId?: string;
  /**
   * Set only for `principalKind: 'api_key'` — the key's own full scope list
   * (KAN-28). KAN-76's act tools (`propose_action`/`approve_action`/
   * `create_goal`/`create_segment`) each require a specific permission
   * beyond the connection-level `mcp.read` gate; for an API-key caller that
   * permission is checked directly against this list (see
   * `mcp-act-authorization.ts`) rather than re-deriving it from a human's
   * role bindings, since a key has no granting human to check against.
   */
  scopes?: readonly ApiKeyScope[];
  /** Set only for `principalKind: 'api_key'` — the key's own id (KAN-28), used as the audit-trail actor identifier for act tools an API key scope permits (e.g. `create_goal`/`create_segment` under `dashboards.write`), since a key has no user id of its own to attribute the action to. */
  apiKeyId?: string;
}

/**
 * Extends the raw Node `IncomingMessage` (not Express's `Request` — this
 * package has no `@types/express` dependency, matching `ApiKeyAuthGuard`'s
 * own "kept dependency-free" convention) with the two extra fields this
 * module's guard/controller need: `body` (Express's own JSON body-parser
 * augmentation, not present on a bare `IncomingMessage`) and
 * `mcpAuthContext` (populated by {@link McpAuthGuard} itself). The MCP SDK's
 * `StreamableHTTPServerTransport.handleRequest` wants exactly an
 * `IncomingMessage`, so this same type serves both the guard and
 * `mcp.controller.ts` without a second, parallel request type.
 */
export interface McpAuthenticatedRequest extends IncomingMessage {
  body?: unknown;
  mcpAuthContext?: McpAuthContext;
}

const BEARER_PREFIX = 'Bearer ';

function extractBearerToken(headerValue: string | string[] | undefined): string | undefined {
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!value || !value.startsWith(BEARER_PREFIX)) {
    return undefined;
  }
  const token = value.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : undefined;
}

/**
 * Authenticates an MCP request (KAN-75) against either credential kind the
 * plan allows, unified into one {@link McpAuthContext}. A bearer value is
 * tried first as an API key (`mcp.read` scope, `ApiKeyAuthGuard`'s own
 * `authenticateApiKey`) since that lookup is a single hash query; only a
 * `invalid_key` outcome (no such key at all — never `insufficient_scope`,
 * which means a *real* key was found and is definitively not this request's
 * credential kind either) falls through to trying it as an MCP OAuth access
 * token.
 *
 * The two credential kinds do *not* carry an identical revocation
 * guarantee, despite both flowing into the same `McpAuthContext` shape:
 * `authenticateMcpAccessToken` re-derives the granting *human's* current
 * `mcp.read` permission on every call (plan `12 §6.1`'s "MCP grants nothing
 * the underlying principal doesn't have"), so a role change or membership
 * removal since the grant was issued takes effect on this request. An API
 * key has no "granting human" to re-check against — `authenticateApiKey`
 * only checks the key's own static `scopes` array and `revoked_at`, exactly
 * like every other bearer-key-authenticated route in this app (KAN-28's own
 * model: a key stays live until *someone* explicitly revokes *that key*,
 * independent of whoever minted it). That's the existing, intentional API
 * key security model this guard reuses unchanged, not a gap introduced
 * here — but it does mean "MCP grants nothing the underlying principal
 * doesn't have" is a live, per-request guarantee for OAuth-authenticated
 * calls and a mint-time-only one for API-key-authenticated calls.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<McpAuthenticatedRequest>();
    const rawToken = extractBearerToken(request.headers['authorization']);
    if (!rawToken) {
      throw new UnauthorizedException('Missing bearer credential (API key or MCP OAuth access token).');
    }

    const apiKeyResult = await authenticateApiKey(rawToken, 'mcp.read');
    if (apiKeyResult.ok) {
      request.mcpAuthContext = {
        organizationId: apiKeyResult.value.organizationId,
        projectId: apiKeyResult.value.projectId,
        principalKind: 'api_key',
        scopes: apiKeyResult.value.scopes,
        apiKeyId: apiKeyResult.value.apiKey.id,
      };
      return true;
    }
    if (apiKeyResult.error.reason === 'insufficient_scope') {
      throw new ForbiddenException(apiKeyResult.error.message);
    }

    const oauthResult = await authenticateMcpAccessToken(rawToken);
    if (oauthResult.ok) {
      request.mcpAuthContext = {
        organizationId: oauthResult.value.organizationId,
        projectId: oauthResult.value.projectId,
        principalKind: 'oauth',
        userId: oauthResult.value.userId,
      };
      return true;
    }
    if (oauthResult.error.reason === 'insufficient_permission') {
      throw new ForbiddenException(oauthResult.error.message);
    }

    throw new UnauthorizedException('Invalid bearer credential.');
  }
}
