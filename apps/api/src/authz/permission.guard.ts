import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type Permission } from '@growthos/shared';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PERMISSION_KEY } from './permission.decorator';
import { resourceScopeFromParams, type AuthenticatedRequest } from './policy-request';

/**
 * Global authz guard (wired via `APP_GUARD`). Deny-by-default: a route
 * without `@Public()` or `@RequirePermission(...)` is denied outright — the
 * `growthos/require-permission-annotation` eslint rule catches this at lint
 * time, but the guard also refuses to fail open if that's ever bypassed.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const klass = context.getClass();

    // Handler-level metadata always wins over class-level: a method's own
    // @RequirePermission(...) must be enforced even on a controller that is
    // otherwise @Public(), and a method's own @Public() opts it out even on
    // a controller that otherwise requires a permission.
    const handlerPermission = this.reflector.get<Permission | undefined>(PERMISSION_KEY, handler);
    if (handlerPermission !== undefined) {
      return this.checkPermission(handlerPermission, context);
    }
    if (this.reflector.get<boolean | undefined>(IS_PUBLIC_KEY, handler)) {
      return true;
    }

    const classPermission = this.reflector.get<Permission | undefined>(PERMISSION_KEY, klass);
    if (classPermission !== undefined) {
      return this.checkPermission(classPermission, context);
    }
    if (this.reflector.get<boolean | undefined>(IS_PUBLIC_KEY, klass)) {
      return true;
    }

    throw new ForbiddenException(
      'Route is missing a @RequirePermission(...) or @Public() annotation (deny-by-default).',
    );
  }

  private checkPermission(permission: Permission, context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.principal;
    if (!principal) {
      throw new UnauthorizedException('No authenticated principal on request.');
    }

    const bindings = request.bindings ?? [];
    const resource = resourceScopeFromParams(request);

    if (!can(bindings, principal, permission, resource)) {
      throw new ForbiddenException(`Missing required permission: ${permission}`);
    }

    return true;
  }
}
