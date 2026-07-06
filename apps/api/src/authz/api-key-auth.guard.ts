import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { authenticateApiKey, type ApiKeyAuthContext } from '@growthos/firebase-orm-models';
import type { ApiKeyScope } from '@growthos/shared';
import { API_KEY_SCOPE_KEY } from './api-key-scope.decorator';

/**
 * The request shape `ApiKeyAuthGuard` expects — a minimal subset of Express's
 * `Request`, kept dependency-free like `AuthenticatedRequest`
 * (`policy-request.ts`) rather than importing `@types/express`.
 * `apiKeyContext` is populated by this guard itself on success, for the
 * route handler to read.
 */
export interface ApiKeyAuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
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
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredScope =
      this.reflector.get<ApiKeyScope | undefined>(API_KEY_SCOPE_KEY, context.getHandler()) ??
      this.reflector.get<ApiKeyScope | undefined>(API_KEY_SCOPE_KEY, context.getClass());
    if (!requiredScope) {
      throw new ForbiddenException('Route is missing a @RequireApiKeyScope(...) annotation (deny-by-default).');
    }

    const request = context.switchToHttp().getRequest<ApiKeyAuthenticatedRequest>();
    const rawKey = extractBearerToken(request.headers['authorization']);
    if (!rawKey) {
      throw new UnauthorizedException('Missing bearer API key.');
    }

    const result = await authenticateApiKey(rawKey, requiredScope);
    if (!result.ok) {
      if (result.error.reason === 'insufficient_scope') {
        throw new ForbiddenException(result.error.message);
      }
      throw new UnauthorizedException(result.error.message);
    }

    request.apiKeyContext = result.value;
    return true;
  }
}
