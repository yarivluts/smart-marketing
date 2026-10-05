import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { authenticateApiKey, defaultApiKeyRateLimiter, type ApiKeyAuthContext, type RateLimiter } from '@growthos/firebase-orm-models';
import { apiKeyKindOf, isOriginAllowed, type ApiKeyScope } from '@growthos/shared';
import { API_KEY_SCOPE_KEY } from './api-key-scope.decorator';
import { ALLOW_PUBLISHABLE_KEY } from './allow-publishable-key.decorator';

/** DI token for the {@link RateLimiter} `ApiKeyAuthGuard` consumes — see `IngestModule`'s provider for how the shared default is wired in, and this guard's own constructor for the fallback used when nothing provides it (e.g. constructing the guard directly in a unit test). */
export const API_KEY_RATE_LIMITER = 'API_KEY_RATE_LIMITER';

/** The minimal response shape `ApiKeyAuthGuard` needs to set a header on before throwing — kept dependency-free like `ApiKeyAuthenticatedRequest` rather than importing `@types/express`. */
export interface HeaderSettableResponse {
  setHeader(name: string, value: string): void;
}

/**
 * The request shape `ApiKeyAuthGuard` expects — a minimal subset of Express's
 * `Request`, kept dependency-free like `AuthenticatedRequest`
 * (`policy-request.ts`) rather than importing `@types/express`.
 * `apiKeyContext` is populated by this guard itself on success, for the
 * route handler to read.
 */
export interface ApiKeyAuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  /** Parsed query string: a publishable key may come as `?key=` (see `extractKey`). */
  query?: Record<string, unknown>;
  apiKeyContext?: ApiKeyAuthContext;
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
 * The presented key: the bearer token, or - for a publishable key only - the `key` query
 * parameter. A browser sending with `navigator.sendBeacon` (the only way that survives a page
 * unload) cannot set headers, and a `text/plain` body with the key in the URL also avoids a CORS
 * preflight. A secret key in a URL would end up in logs and history, so it is refused outright.
 */
function extractKey(request: ApiKeyAuthenticatedRequest): { key: string; fromQuery: boolean } | undefined {
  const bearer = extractBearerToken(request.headers['authorization']);
  if (bearer) return { key: bearer, fromQuery: false };
  const raw = request.query?.['key'];
  const value = (Array.isArray(raw) ? raw[0] : raw) as unknown;
  return typeof value === 'string' && value.trim() ? { key: value.trim(), fromQuery: true } : undefined;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Authenticates machine callers presenting a `gos_live_`/`gos_test_` API key
 * (KAN-28) against a required scope (`@RequireApiKeyScope(...)`) — a
 * fundamentally different credential from the human/service-account role
 * bindings `PermissionGuard` checks, so this is a standalone guard rather
 * than another branch of it. A route using this guard must still carry
 * `@Public()` to satisfy `PermissionGuard`/the `growthos/require-permission-
 * annotation` lint rule, since neither applies to a bearer-key caller.
 *
 * Mirrors the 401-vs-403 split `PermissionGuard` already establishes for
 * human principals: no usable credential at all (missing header, unknown or
 * revoked key) is 401 — nothing was authenticated; a real, live key that
 * simply lacks the required scope is 403 — authentication succeeded,
 * authorization didn't.
 *
 * Also enforces per-key rate limiting (KAN-34 AC: "per-key rate limiting ... 429+Retry-After") once
 * authentication and scope checks both pass — checked after, not before, so a caller presenting an
 * unknown/revoked key never spends (or exhausts) a real key's own budget, and so the check happens
 * only once per request rather than once per route this guard protects.
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject(API_KEY_RATE_LIMITER) private readonly rateLimiter: RateLimiter = defaultApiKeyRateLimiter,
  ) {}

  /** Whether the route is one a browser may call (`@AllowPublishableKey()`). */
  private allowsPublishable(context: ExecutionContext): boolean {
    return Boolean(
      this.reflector.get<boolean | undefined>(ALLOW_PUBLISHABLE_KEY, context.getHandler()) ??
        this.reflector.get<boolean | undefined>(ALLOW_PUBLISHABLE_KEY, context.getClass()),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredScope =
      this.reflector.get<ApiKeyScope | undefined>(API_KEY_SCOPE_KEY, context.getHandler()) ??
      this.reflector.get<ApiKeyScope | undefined>(API_KEY_SCOPE_KEY, context.getClass());
    if (!requiredScope) {
      throw new ForbiddenException('Route is missing a @RequireApiKeyScope(...) annotation (deny-by-default).');
    }

    const request = context.switchToHttp().getRequest<ApiKeyAuthenticatedRequest>();
    const presented = extractKey(request);
    if (!presented) {
      throw new UnauthorizedException('Missing bearer API key.');
    }
    if (presented.fromQuery && apiKeyKindOf(presented.key) !== 'publishable') {
      throw new UnauthorizedException('Only a publishable key may be sent in the URL; send a secret key in the Authorization header.');
    }
    const rawKey = presented.key;

    const result = await authenticateApiKey(rawKey, requiredScope);
    if (!result.ok) {
      if (result.error.reason === 'insufficient_scope') {
        throw new ForbiddenException(result.error.message);
      }
      throw new UnauthorizedException(result.error.message);
    }

    if (result.value.kind === 'publishable') {
      if (!this.allowsPublishable(context)) {
        throw new ForbiddenException('A publishable key can only send events; use a secret key on a server for this.');
      }
      const origin = headerValue(request.headers['origin']);
      if (!isOriginAllowed(origin, result.value.allowedOrigins)) {
        throw new ForbiddenException(origin ? `This publishable key does not allow requests from ${origin}. Add it to the key's allowed origins.` : 'A publishable key only works from a web page on one of its allowed origins.');
      }
    } else if (presented.fromQuery) {
      throw new UnauthorizedException('Only a publishable key may be sent in the URL.');
    } else if (headerValue(request.headers['origin']) && this.allowsPublishable(context)) {
      // A secret key arriving from a web page has leaked into page source. Refuse it on the browser
      // routes, where CORS would otherwise let it work, and say what to use instead.
      throw new ForbiddenException('A secret key must never be used in a web page: mint a publishable key (with allowed origins) for the browser.');
    }

    const rateLimit = this.rateLimiter.consume(result.value.apiKey.id);
    if (!rateLimit.allowed) {
      const response = context.switchToHttp().getResponse<HeaderSettableResponse>();
      response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
      throw new HttpException('Rate limit exceeded for this API key.', HttpStatus.TOO_MANY_REQUESTS);
    }

    request.apiKeyContext = result.value;
    return true;
  }
}
