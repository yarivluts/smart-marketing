import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PolicyBinding } from '@growthos/shared';
import { PermissionGuard } from './permission.guard';
import { PERMISSION_KEY } from './permission.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { AuthenticatedRequest } from './policy-request';

const HANDLER = Symbol('handler');
const CLASS = Symbol('class');

function makeGuard(
  handlerMetadata: Record<string, unknown>,
  classMetadata: Record<string, unknown> = {},
): {
  guard: PermissionGuard;
  context: (request: Partial<AuthenticatedRequest>) => ExecutionContext;
} {
  const reflector = {
    get: (key: string, target: symbol) =>
      target === HANDLER ? handlerMetadata[key] : classMetadata[key],
  } as unknown as Reflector;
  const guard = new PermissionGuard(reflector);

  const context = (request: Partial<AuthenticatedRequest>): ExecutionContext =>
    ({
      getHandler: () => HANDLER,
      getClass: () => CLASS,
      switchToHttp: () => ({
        getRequest: () => ({ params: {}, ...request }) as AuthenticatedRequest,
      }),
    }) as unknown as ExecutionContext;

  return { guard, context };
}

describe('PermissionGuard', () => {
  it('allows a route annotated with @Public() without a principal', () => {
    const { guard, context } = makeGuard({ [IS_PUBLIC_KEY]: true });
    expect(guard.canActivate(context({}))).toBe(true);
  });

  it('denies (fails closed) a route with neither @Public() nor @RequirePermission', () => {
    const { guard, context } = makeGuard({});
    expect(() => guard.canActivate(context({ principal: { type: 'user', id: 'u1' } }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects an unauthenticated request on a permission-annotated route', () => {
    const { guard, context } = makeGuard({ [PERMISSION_KEY]: 'schema.write' });
    expect(() => guard.canActivate(context({}))).toThrow(UnauthorizedException);
  });

  it('denies when no role binding grants the required permission', () => {
    const { guard, context } = makeGuard({ [PERMISSION_KEY]: 'billing.manage' });
    const bindings: PolicyBinding[] = [
      { principalType: 'user', principalId: 'u1', role: 'viewer', scopeLevel: 'org', scopeId: 'org-1' },
    ];
    expect(() =>
      guard.canActivate(
        context({
          principal: { type: 'user', id: 'u1' },
          bindings,
          params: { orgId: 'org-1' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows when a role binding grants the required permission at the requested scope', () => {
    const { guard, context } = makeGuard({ [PERMISSION_KEY]: 'schema.write' });
    const bindings: PolicyBinding[] = [
      {
        principalType: 'user',
        principalId: 'u1',
        role: 'project_admin',
        scopeLevel: 'org',
        scopeId: 'org-1',
      },
    ];
    expect(
      guard.canActivate(
        context({
          principal: { type: 'user', id: 'u1' },
          bindings,
          params: { orgId: 'org-1' },
        }),
      ),
    ).toBe(true);
  });

  it('denies a binding scoped to a sibling project', () => {
    const { guard, context } = makeGuard({ [PERMISSION_KEY]: 'schema.write' });
    const bindings: PolicyBinding[] = [
      {
        principalType: 'user',
        principalId: 'u1',
        role: 'project_admin',
        scopeLevel: 'project',
        scopeId: 'project-other',
      },
    ];
    expect(() =>
      guard.canActivate(
        context({
          principal: { type: 'user', id: 'u1' },
          bindings,
          params: { orgId: 'org-1', projectId: 'project-1' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('enforces a method-level @RequirePermission even when the controller is @Public()', () => {
    const { guard, context } = makeGuard(
      { [PERMISSION_KEY]: 'billing.manage' },
      { [IS_PUBLIC_KEY]: true },
    );
    // No principal at all: the class-level @Public() must not short-circuit
    // this route, so it should reject as unauthenticated, not allow.
    expect(() => guard.canActivate(context({}))).toThrow(UnauthorizedException);
  });

  it('lets a method-level @Public() opt out of a controller-level @RequirePermission', () => {
    const { guard, context } = makeGuard(
      { [IS_PUBLIC_KEY]: true },
      { [PERMISSION_KEY]: 'billing.manage' },
    );
    expect(guard.canActivate(context({}))).toBe(true);
  });

  it('falls back to a class-level @RequirePermission when the method has no annotation', () => {
    const { guard, context } = makeGuard({}, { [PERMISSION_KEY]: 'schema.write' });
    const bindings: PolicyBinding[] = [
      {
        principalType: 'user',
        principalId: 'u1',
        role: 'project_admin',
        scopeLevel: 'org',
        scopeId: 'org-1',
      },
    ];
    expect(
      guard.canActivate(
        context({ principal: { type: 'user', id: 'u1' }, bindings, params: { orgId: 'org-1' } }),
      ),
    ).toBe(true);
  });
});
