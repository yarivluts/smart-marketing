import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { authenticateApiKey, authenticateMcpAccessToken } from '@growthos/firebase-orm-models';
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
} {
  const fullRequest = { headers: {}, ...request } as McpAuthenticatedRequest;
  return {
    request: fullRequest,
    context: {
      switchToHttp: () => ({ getRequest: () => fullRequest }),
    } as unknown as ExecutionContext,
  };
}

describe('McpAuthGuard', () => {
  let guard: McpAuthGuard;

  beforeEach(() => {
    guard = new McpAuthGuard();
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
      value: { apiKey: {} as never, organizationId: 'org-1', projectId: 'proj-1', environmentId: 'env-1', scopes: ['mcp.read'] },
    });
    const { context, request } = makeContext({ headers: { authorization: 'Bearer gos_live_ok' } });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockAuthenticateApiKey).toHaveBeenCalledWith('gos_live_ok', 'mcp.read');
    expect(mockAuthenticateMcpAccessToken).not.toHaveBeenCalled();
    expect(request.mcpAuthContext).toEqual({ organizationId: 'org-1', projectId: 'proj-1', principalKind: 'api_key' });
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
      value: { organizationId: 'org-1', projectId: 'proj-1', userId: 'user-1', scope: 'mcp:read' },
    });
    const { context, request } = makeContext({ headers: { authorization: 'Bearer some-oauth-token' } });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockAuthenticateMcpAccessToken).toHaveBeenCalledWith('some-oauth-token');
    expect(request.mcpAuthContext).toEqual({ organizationId: 'org-1', projectId: 'proj-1', principalKind: 'oauth', userId: 'user-1' });
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
});
