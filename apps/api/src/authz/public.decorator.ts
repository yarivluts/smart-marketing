import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'growthos:is-public';

/**
 * Opts a route (or every route on a controller) out of the permission check
 * performed by {@link PermissionGuard} — for routes with no principal to check,
 * such as uptime probes. Every route must carry either this or `@RequirePermission(...)`.
 */
export function Public(): MethodDecorator & ClassDecorator {
  return SetMetadata(IS_PUBLIC_KEY, true);
}
