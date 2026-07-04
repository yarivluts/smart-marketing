import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@growthos/shared';

export const PERMISSION_KEY = 'growthos:required-permission';

/**
 * Annotates a route (or every route on a controller) with the permission a
 * caller must hold, evaluated by {@link PermissionGuard} against the deny-by-default
 * policy engine in `@growthos/shared`. Every route must carry either this or
 * `@Public()` — enforced by the `growthos/require-permission-annotation` eslint rule.
 */
export function RequirePermission(permission: Permission): MethodDecorator & ClassDecorator {
  return SetMetadata(PERMISSION_KEY, permission);
}
