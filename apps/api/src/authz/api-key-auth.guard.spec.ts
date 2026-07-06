import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { authenticateApiKey } from '@growthos/firebase-orm-models';
import { ApiKeyAuthGuard, type ApiKeyAuthenticatedRequest } from './api-key-auth.guard';
import { API_KEY_SCOPE_KEY } from './api-key-scope.decorator';

jest.mock('@growthos/firebase-orm-models', () => ({ authenticateApiKey: jest.fn() }));

const mockAuthenticateApiKey = authenticateApiKey as jest.MockedFunction<typeof authenticateApiKey>;

const HANDLER = Symbol('handler');
const CLASS = Symbol('class');

function makeGuard(
  handlerMetadata: Record<string, unknown>,
  classMetadata: Record<string, unknown> = {},
): {
  guard: ApiKeyAuthGuard;
  context: (request: Partial<ApiKeyAuthenticatedRequest>) => ExecutionContext;
} {
  const reflector = {
    get: (key: string, target: symbol) => (target === HANDLER ? handlerMetadata[key] : classMetadata[key]),
  } as unknown as Reflector;
  const guard = new ApiKeyAuthGuard(reflector);

  const context = (request: Partial<ApiKeyAuthenticatedRequest>): ExecutionContext => {
    // Mutate and return the same reference on every `getRequest()` call (rather
    // than spreading a fresh copy) so the guard's `request.apiKeyContext = ...`
    // side effect is observable by the caller's own `request` variable.
    request.headers = request.headers ?? {};
    return {
      getHandler: () => HANDLER,
      getClass: () => CLASS,
      switchToHttp: () => ({
        getRequest: () => request as ApiKeyAuthenticatedRequest,
      }),
    } as unknown as ExecutionContext;
  };

  return { guard, context };
}

describe('ApiKeyAuthGuard', () => {
  beforeEach(() => {
    mockAuthenticateApiKey.mockReset();
  });

  it('fails closed (403) when the route carries no @RequireApiKeyScope(...) annotation', async () => {
    const { guard, context } = makeGuard({});
    await expect(guard.canActivate(context({}))).rejects.toThrow(ForbiddenException);
    expect(mockAuthenticateApiKey).not.toHaveBeenCalled();
  });

  it('rejects (401) a request with no Authorization header', async () => {
    const { guard, context } = makeGuard({ [API_KEY_SCOPE_KEY]: 'ingest.write' });
    await expect(guard.canActivate(context({ headers: {} }))).rejects.toThrow(UnauthorizedException);
    expect(mockAuthenticateApiKey).not.toHaveBeenCalled();
  });

  it('rejects (401) a malformed (non-Bearer) Authorization header', async () => {
    const { guard, context } = makeGuard({ [API_KEY_SCOPE_KEY]: 'ingest.write' });
    await expect(
      guard.canActivate(context({ headers: { authorization: 'Basic abc123' } })),
    ).rejects.toThrow(UnauthorizedException);
    expect(mockAuthenticateApiKey).not.toHaveBeenCalled();
  });

  it('rejects (401) an unknown or revoked key', async () => {
    mockAuthenticateApiKey.mockResolvedValue({ ok: false, error: { reason: 'invalid_key', message: 'Invalid API key.' } });
    const { guard, context } = makeGuard({ [API_KEY_SCOPE_KEY]: 'ingest.write' });

    await expect(
      guard.canActivate(context({ headers: { authorization: 'Bearer gos_live_bad' } })),
    ).rejects.toThrow(UnauthorizedException);
    expect(mockAuthenticateApiKey).toHaveBeenCalledWith('gos_live_bad', 'ingest.write');
  });

  it('rejects (403) a live key that lacks the required scope', async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      ok: false,
      error: { reason: 'insufficient_scope', message: 'This API key does not carry the required scope.' },
    });
    const { guard, context } = makeGuard({ [API_KEY_SCOPE_KEY]: 'ingest.write' });

    await expect(
      guard.canActivate(context({ headers: { authorization: 'Bearer gos_live_ok' } })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows a valid key with the required scope and attaches apiKeyContext to the request', async () => {
    const authContext = {
      apiKey: {} as never,
      organizationId: 'org-1',
      projectId: 'proj-1',
      environmentId: 'env-1',
      scopes: ['ingest.write'] as const,
    };
    mockAuthenticateApiKey.mockResolvedValue({ ok: true, value: authContext });
    const { guard, context } = makeGuard({ [API_KEY_SCOPE_KEY]: 'ingest.write' });

    const request: ApiKeyAuthenticatedRequest = { headers: { authorization: 'Bearer gos_live_ok' } };
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.apiKeyContext).toBe(authContext);
  });

  it('falls back to a class-level @RequireApiKeyScope when the method has no annotation', async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      ok: false,
      error: { reason: 'invalid_key', message: 'Invalid API key.' },
    });
    const { guard, context } = makeGuard({}, { [API_KEY_SCOPE_KEY]: 'ingest.write' });

    await expect(
      guard.canActivate(context({ headers: { authorization: 'Bearer gos_live_bad' } })),
    ).rejects.toThrow(UnauthorizedException);
    expect(mockAuthenticateApiKey).toHaveBeenCalledWith('gos_live_bad', 'ingest.write');
  });
});
