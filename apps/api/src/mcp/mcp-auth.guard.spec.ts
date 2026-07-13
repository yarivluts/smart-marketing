import { ExecutionContext, ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import { authenticateApiKey, authenticateMcpAccessToken } from '@growthos/firebase-orm-models';
import type { RateLimiter } from '@growthos/firebase-orm-models';
import { McpAuthGuard, type McpAuthenticatedRequest } from './mcp-auth.guard';

jest.mock('@growthos/firebase-orm-models', () => {
  const actual = jest.requireActual('@growthos/firebase-orm-models');
  return { ...actual, authenticateApiKey: jest.fn(), authenticateMcpAccessToken: jest.fn() };
});

const mockAuthenticateApiKey = authenticateApiKey as jest.MockedFunction<typeof authenticateApiKey>;
const mockAuthenticateMcpAccessToken = authenticateMcpAccessToken as jest.MockedFunction<typeof authenticateMcpAccessToken>;

function makeContext(request: Partial<McpAuthenticatedRequest>): {
  context: ExecutionContext;
  request: McpAuthenticatedRequest;
  setHeader: jest.Mock;
} {
  const fullRequest = { headers: {}, ...request } as McpAuthenticatedRequest;
  const setHeader = jest.fn();
  return {
    request: fullRequest,
    setHeader,
    context: {
      switchToHttp: () => ({ getRequest: () => fullRequest, getResponse: () => ({ setHeader }) }),
    } as unknown as ExecutionContext,
  };
}

function fakeRateLimiter(allowed: boolean): RateLimiter {
  return { consume: jest.fn().mockReturnValue({ allowed, remaining: allowed ? 1 : 0, retryAfterSeconds: allowed ? 0 : 7 }) };
}

describe('McpAuthGuard', () => {
  let guard: McpAuthGuard;

  beforeEach(() => {
    guard = new McpAuthGuard(fakeRateLimiter(true));
    mockAuthenticateApiKey.mockReset();
    mockAuthenticateMcpAccessToken.mockReset();
  });

  it('rejects (401) a request with no Authorization header', async () => {
    const { context } = makeContext({ headers: {} });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(mockAuthenticateApiKey).not.toHaveBeenCalled();
    expect(mockAuthenticateMcpAccessToken).not.toHaveBeenCalled();
  });

  it('rejects (401) a malformed (non-Bearer) Authorization header', async () => {
    const { context } = makeContext({ headers: { authorization: 'Basic abc123' } });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('authenticates a live API key with the mcp.read scope, attaching principalKind "api_key"', async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      ok: true,
      value: { apiKey: { id: 'key-1' } as never, organizationId: 'org-1', projectId: 'proj-1', environmentId: 'env-1', scopes: ['mcp.read'] },
    });
    const { context, request } = makeContext({ headers: { authorization: 'Bearer gos_live_ok' } });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockAuthenticateApiKey).toHaveBeenCalledWith('gos_live_ok', 'mcp.read');
    expect(mockAuthenticateMcpAccessToken).not.toHaveBeenCalled();
    expect(request.mcpAuthContext).toEqual({
      organizationId: 'org-1',
      projectId: 'proj-1',
      principalKind: 'api_key',
      scopes: ['mcp.read'],
      apiKeyId: 'key-1',
    });
  });

  it('rejects (403) a live API key that lacks the mcp.read scope, without falling through to OAuth', async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      ok: false,
      error: { reason: 'insufficient_scope', message: 'This API key does not carry the required scope.' },
    });
    const { context } = makeContext({ headers: { authorization: 'Bearer gos_live_scoped_wrong' } });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    expect(mockAuthenticateMcpAccessToken).not.toHaveBeenCalled();
  });

  it('falls through to OAuth token auth when the bearer value is not a known API key', async () => {
    mockAuthenticateApiKey.mockResolvedValue({ ok: false, error: { reason: 'invalid_key', message: 'Invalid API key.' } });
    mockAuthenticateMcpAccessToken.mockResolvedValue({
      ok: true,
      value: { organizationId: 'org-1', projectId: 'proj-1', userId: 'user-1', scope: 'mcp:read', grantId: 'grant-1', clientId: 'client-1' },
    });
    const { context, request } = makeContext({ headers: { authorization: 'Bearer some-oauth-token' } });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockAuthenticateMcpAccessToken).toHaveBeenCalledWith('some-oauth-token');
    expect(request.mcpAuthContext).toEqual({
      organizationId: 'org-1',
      projectId: 'proj-1',
      principalKind: 'oauth',
      userId: 'user-1',
      grantId: 'grant-1',
      clientId: 'client-1',
    });
  });

  it('rejects (403) an OAuth token whose granting user no longer holds mcp.read', async () => {
    mockAuthenticateApiKey.mockResolvedValue({ ok: false, error: { reason: 'invalid_key', message: 'Invalid API key.' } });
    mockAuthenticateMcpAccessToken.mockResolvedValue({
      ok: false,
      error: { reason: 'insufficient_permission', message: 'The granting user no longer holds mcp.read for this project.' },
    });
    const { context } = makeContext({ headers: { authorization: 'Bearer stale-oauth-token' } });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('rejects (401) when neither credential kind recognizes the bearer value', async () => {
    mockAuthenticateApiKey.mockResolvedValue({ ok: false, error: { reason: 'invalid_key', message: 'Invalid API key.' } });
    mockAuthenticateMcpAccessToken.mockResolvedValue({ ok: false, error: { reason: 'invalid_token', message: 'Invalid or revoked MCP access token.' } });
    const { context } = makeContext({ headers: { authorization: 'Bearer garbage' } });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  describe('per-credential rate limiting (KAN-77)', () => {
    it('rejects (429) an otherwise-valid API key once its bucket is exhausted, setting Retry-After', async () => {
      const limiter = fakeRateLimiter(false);
      const limitedGuard = new McpAuthGuard(limiter);
      mockAuthenticateApiKey.mockResolvedValue({
        ok: true,
        value: { apiKey: { id: 'key-1' } as never, organizationId: 'org-1', projectId: 'proj-1', environmentId: 'env-1', scopes: ['mcp.read'] },
      });
      const { context, setHeader } = makeContext({ headers: { authorization: 'Bearer gos_live_ok' } });

      await expect(limitedGuard.canActivate(context)).rejects.toThrow(HttpException);
      expect(limiter.consume).toHaveBeenCalledWith('api_key:key-1');
      expect(setHeader).toHaveBeenCalledWith('Retry-After', '7');
    });

    it('rejects (429) an otherwise-valid OAuth token once its grant bucket is exhausted, bucketed by grantId not userId', async () => {
      const limiter = fakeRateLimiter(false);
      const limitedGuard = new McpAuthGuard(limiter);
      mockAuthenticateApiKey.mockResolvedValue({ ok: false, error: { reason: 'invalid_key', message: 'Invalid API key.' } });
      mockAuthenticateMcpAccessToken.mockResolvedValue({
        ok: true,
        value: { organizationId: 'org-1', projectId: 'proj-1', userId: 'user-1', scope: 'mcp:read', grantId: 'grant-1', clientId: 'client-1' },
      });
      const { context, setHeader } = makeContext({ headers: { authorization: 'Bearer some-oauth-token' } });

      await expect(limitedGuard.canActivate(context)).rejects.toThrow(HttpException);
      expect(limiter.consume).toHaveBeenCalledWith('oauth_grant:grant-1');
      expect(setHeader).toHaveBeenCalledWith('Retry-After', '7');
    });

    it('never consumes the rate limiter for a credential that fails authentication', async () => {
      const limiter = fakeRateLimiter(true);
      const limitedGuard = new McpAuthGuard(limiter);
      mockAuthenticateApiKey.mockResolvedValue({ ok: false, error: { reason: 'invalid_key', message: 'Invalid API key.' } });
      mockAuthenticateMcpAccessToken.mockResolvedValue({ ok: false, error: { reason: 'invalid_token', message: 'Invalid or revoked MCP access token.' } });
      const { context } = makeContext({ headers: { authorization: 'Bearer garbage' } });

      await expect(limitedGuard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(limiter.consume).not.toHaveBeenCalled();
    });
  });
});
