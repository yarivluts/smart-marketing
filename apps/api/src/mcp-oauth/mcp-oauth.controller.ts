import { BadRequestException, Body, Controller, Get, Post, Query, Redirect } from '@nestjs/common';
import {
  exchangeMcpAuthorizationCode,
  InvalidMcpOAuthClientError,
  MCP_READ_SCOPE,
  refreshMcpAccessToken,
  registerMcpOAuthClient,
  requireRegisteredRedirectUri,
  type McpOAuthTokenResult,
} from '@growthos/firebase-orm-models';
import { Public } from '../authz/public.decorator';
import { apiBaseUrl, webAppUrl } from './mcp-oauth-urls';

/**
 * OAuth 2.1 authorization-server protocol endpoints (KAN-75, plan `12 §6.1`)
 * — everything an MCP client (Claude Desktop, claude.ai, a custom agent)
 * talks to directly, with no GrowthOS session of its own: discovery
 * metadata, dynamic client registration (RFC 7591-lite), the `/authorize`
 * redirect into `apps/web`'s login+consent UI, and the token endpoint.
 *
 * The actual consent decision (which org/project to grant, verifying the
 * human holds `mcp.read` there) happens in `apps/web` — the only place a
 * Firebase session cookie and this codebase's i18n'd UI live — which calls
 * `issueMcpAuthorizationCode` directly. This controller never sees a user
 * session; every route here is `@Public()` and only ever validates
 * client/PKCE/token mechanics via `@growthos/firebase-orm-models`'s
 * `mcp-oauth.service.ts`.
 */
/** The OAuth token-response body shape (RFC 6749 §5.1) both `grant_type` branches of `token()` return. */
function toTokenResponse(value: McpOAuthTokenResult) {
  return {
    access_token: value.accessToken,
    token_type: 'Bearer',
    expires_in: value.expiresInSeconds,
    refresh_token: value.refreshToken,
    scope: value.scope,
  };
}

@Controller()
@Public()
export class McpOAuthController {
  @Get('.well-known/oauth-authorization-server')
  authorizationServerMetadata() {
    const issuer = apiBaseUrl();
    return {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [MCP_READ_SCOPE],
    };
  }

  @Get('.well-known/oauth-protected-resource')
  protectedResourceMetadata() {
    const issuer = apiBaseUrl();
    return {
      resource: `${issuer}/v1/mcp`,
      authorization_servers: [issuer],
      scopes_supported: [MCP_READ_SCOPE],
      bearer_methods_supported: ['header'],
    };
  }

  /** Dynamic client registration (RFC 7591-lite) — an MCP client self-registers before its first `/oauth/authorize` redirect. Always issues a public (secret-less) client; see `McpOAuthClientModel`'s own doc comment for why. */
  @Post('oauth/register')
  async register(@Body() body: unknown) {
    if (typeof body !== 'object' || body === null) {
      throw new BadRequestException('Request body must be a JSON object.');
    }
    const { client_name: clientName, redirect_uris: redirectUris } = body as Record<string, unknown>;
    if (typeof clientName !== 'string' || !Array.isArray(redirectUris) || !redirectUris.every((uri) => typeof uri === 'string')) {
      throw new BadRequestException('"client_name" (string) and "redirect_uris" (string[]) are required.');
    }

    try {
      const client = await registerMcpOAuthClient({ clientName, redirectUris });
      return {
        client_id: client.id,
        client_name: client.client_name,
        redirect_uris: client.redirect_uris,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      };
    } catch (error) {
      if (error instanceof InvalidMcpOAuthClientError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  /**
   * Redirects the browser into `apps/web`'s login+consent page, passing the
   * whole authorization request through unchanged as query params — this
   * controller stores nothing of its own (no "pending authorize session"):
   * `apps/web`'s consent POST route re-validates `client_id`/`redirect_uri`
   * itself and calls straight into `issueMcpAuthorizationCode`, so there is
   * no server-side state to keep in sync between the two hops.
   */
  @Get('oauth/authorize')
  @Redirect()
  async authorize(@Query() query: Record<string, string>) {
    const { client_id: clientId, redirect_uri: redirectUri, response_type: responseType, code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod } = query;

    if (!clientId || !redirectUri || !codeChallenge) {
      throw new BadRequestException('client_id, redirect_uri, and code_challenge are required.');
    }
    if (responseType !== 'code') {
      throw new BadRequestException('response_type must be "code" (OAuth 2.1 supports only the authorization-code flow).');
    }
    if (codeChallengeMethod !== 'S256') {
      throw new BadRequestException('code_challenge_method must be "S256".');
    }

    try {
      await requireRegisteredRedirectUri(clientId, redirectUri);
    } catch (error) {
      if (error instanceof InvalidMcpOAuthClientError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const url = new URL('/oauth/mcp/consent', webAppUrl());
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    return { url: url.toString(), statusCode: 302 };
  }

  @Post('oauth/token')
  async token(@Body() body: Record<string, string>) {
    const grantType = body.grant_type;
    if (grantType === 'authorization_code') {
      const { code, redirect_uri: redirectUri, client_id: clientId, code_verifier: codeVerifier } = body;
      if (!code || !redirectUri || !clientId || !codeVerifier) {
        throw new BadRequestException('code, redirect_uri, client_id, and code_verifier are required.');
      }
      const result = await exchangeMcpAuthorizationCode({ code, redirectUri, clientId, codeVerifier });
      if (!result.ok) {
        throw new BadRequestException(result.error.message);
      }
      return toTokenResponse(result.value);
    }

    if (grantType === 'refresh_token') {
      const { refresh_token: refreshToken, client_id: clientId } = body;
      if (!refreshToken || !clientId) {
        throw new BadRequestException('refresh_token and client_id are required.');
      }
      const result = await refreshMcpAccessToken({ refreshToken, clientId });
      if (!result.ok) {
        throw new BadRequestException(result.error.message);
      }
      return toTokenResponse(result.value);
    }

    throw new BadRequestException('Unsupported grant_type — must be "authorization_code" or "refresh_token".');
  }
}
