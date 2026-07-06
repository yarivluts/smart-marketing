import { SetMetadata } from '@nestjs/common';
import type { ApiKeyScope } from '@growthos/shared';

export const API_KEY_SCOPE_KEY = 'growthos:required-api-key-scope';

/**
 * Annotates a route (or every route on a controller) with the API-key scope
 * a machine caller must present, checked by {@link ApiKeyAuthGuard} — the
 * bearer-key analog of `@RequirePermission` for human/service-account
 * principals. Routes using this still need `@Public()` too, since
 * `PermissionGuard`'s RBAC check doesn't apply to API-key callers.
 */
export function RequireApiKeyScope(scope: ApiKeyScope): MethodDecorator & ClassDecorator {
  return SetMetadata(API_KEY_SCOPE_KEY, scope);
}
