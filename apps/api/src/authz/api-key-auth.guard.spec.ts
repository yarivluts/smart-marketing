import { ExecutionContext, ForbiddenException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { authenticateApiKey, InMemoryTokenBucketRateLimiter, type RateLimiter } from '@growthos/firebase-orm-models';
import { ApiKeyAuthGuard, type ApiKeyAuthenticatedRequest, type HeaderSettableResponse } from './api-key-auth.guard';
import { API_KEY_SCOPE_KEY } from './api-key-scope.decorator';

jest.mock('@growthos/firebase-orm-models', () => {
  const actual = jest.requireActual('@growthos/firebase-orm-models');
  return { ...actual, authenticateApiKey: jest.fn() };
});

const mockAuthenticateApiKey = authenticateApiKey as jest.MockedFunction<typeof authenticateApiKey>;

const HANDLER = Symbol('handler');
const CLASS = Symbol('class');

/** A rate limiter with effectively unlimited headroom — every test in this file except the dedicated rate-limit `describe` block below cares about auth/scope behavior only, not rate limiting. */
function unlimitedRateLimiter(): RateLimiter {
  return new InMemoryTokenBucketRateLimiter({ capacity: 1_000_000, refillPerSecond: 1_000_000 });
}

function makeGuard(
  handlerMetadata: Record<string, unknown>,
  classMetadata: Record<string, unknown> = {},
  rateLimiter: RateLimiter = unlimitedRateLimiter(),
): {
  guard: ApiKeyAuthGuard;
  context: (request: Partial<ApiKeyAuthenticatedRequest>) => ExecutionContext;
  setHeader: jest.Mock;
} {
  const reflector = {
    get: (key: string, target: symbol) => (target === HANDLER ? handlerMetadata[key] : classMetadata[key]),
  } as unknown as Reflector;
  const guard = new ApiKeyAuthGuard(reflector, rateLimiter);
  const setHeader = jest.fn();

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
        getResponse: () => ({ setHeader } as unknown as HeaderSettableResponse),
      }),
    } as unknown as ExecutionContext;
  };

  return { guard, context, setHeader };
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

  describe('per-key rate limiting (KAN-34)', () => {
    function authContextFor(apiKeyId: string) {
      return {
        apiKey: { id: apiKeyId } as never,
        organizationId: 'org-1',
        projectId: 'proj-1',
        environmentId: 'env-1',
        scopes: ['ingest.write'] as const,
      };
    }

    it('falls back to the shared defaultApiKeyRateLimiter when constructed without one (e.g. no DI provider registered)', async () => {
      mockAuthenticateApiKey.mockResolvedValue({ ok: true, value: authContextFor(`key-${Math.random()}`) });
      const reflector = {
        get: (key: string, target: symbol) => (target === HANDLER ? ({ [API_KEY_SCOPE_KEY]: 'ingest.write' } as Record<string, unknown>)[key] : undefined),
      } as unknown as Reflector;
      const guard = new ApiKeyAuthGuard(reflector);
      const request: ApiKeyAuthenticatedRequest = { headers: { authorization: 'Bearer gos_live_ok' } };
      const context = {
        getHandler: () => HANDLER,
        getClass: () => CLASS,
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => ({ setHeader: jest.fn() }) as unknown as HeaderSettableResponse,
        }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('rejects (429) once the bucket is exhausted and sets a Retry-After header', async () => {
      mockAuthenticateApiKey.mockResolvedValue({ ok: true, value: authContextFor('key-1') });
      const rateLimiter = new InMemoryTokenBucketRateLimiter({ capacity: 1, refillPerSecond: 1 });
      const { guard, context, setHeader } = makeGuard({ [API_KEY_SCOPE_KEY]: 'ingest.write' }, {}, rateLimiter);
      const request = () => context({ headers: { authorization: 'Bearer gos_live_ok' } });

      await expect(guard.canActivate(request())).resolves.toBe(true);

      const rejection = guard.canActivate(request());
      await expect(rejection).rejects.toThrow(HttpException);
      await rejection.catch((error: HttpException) => {
        expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      });
      expect(setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
      expect(Number(setHeader.mock.calls[0][1])).toBeGreaterThan(0);
    });

    it('does not consume a real key bucket when authentication itself fails', async () => {
      mockAuthenticateApiKey.mockResolvedValue({ ok: false, error: { reason: 'invalid_key', message: 'Invalid API key.' } });
      const rateLimiter = new InMemoryTokenBucketRateLimiter({ capacity: 1, refillPerSecond: 1 });
      const { guard, context } = makeGuard({ [API_KEY_SCOPE_KEY]: 'ingest.write' }, {}, rateLimiter);

      await expect(
        guard.canActivate(context({ headers: { authorization: 'Bearer gos_live_bad' } })),
      ).rejects.toThrow(UnauthorizedException);

      // The bucket for the (never-resolved) key is untouched — a subsequent *successful* auth against
      // a real key sharing no bucket state with the failed attempt above must still be allowed.
      mockAuthenticateApiKey.mockResolvedValue({ ok: true, value: authContextFor('key-1') });
      await expect(
        guard.canActivate(context({ headers: { authorization: 'Bearer gos_live_ok' } })),
      ).resolves.toBe(true);
    });

    it('tracks separate keys independently — exhausting one key does not affect another', async () => {
      const rateLimiter = new InMemoryTokenBucketRateLimiter({ capacity: 1, refillPerSecond: 1 });
      const { guard, context } = makeGuard({ [API_KEY_SCOPE_KEY]: 'ingest.write' }, {}, rateLimiter);

      mockAuthenticateApiKey.mockResolvedValue({ ok: true, value: authContextFor('key-1') });
      await expect(guard.canActivate(context({ headers: { authorization: 'Bearer k1' } }))).resolves.toBe(true);
      await expect(guard.canActivate(context({ headers: { authorization: 'Bearer k1' } }))).rejects.toThrow(HttpException);

      mockAuthenticateApiKey.mockResolvedValue({ ok: true, value: authContextFor('key-2') });
      await expect(guard.canActivate(context({ headers: { authorization: 'Bearer k2' } }))).resolves.toBe(true);
    });
  });
});
