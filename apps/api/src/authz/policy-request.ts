import type { PolicyBinding, Principal, ResourceScope } from '@growthos/shared';

export type { Principal as RequestPrincipal };

/**
 * The request shape `PermissionGuard` expects — a minimal subset of Express's
 * `Request` (kept dependency-free rather than importing `@types/express`).
 * `principal` and `bindings` are populated upstream by auth middleware
 * (KAN-21) and the role-binding lookup (KAN-22/KAN-26); until those land,
 * both are absent and every non-public route denies, per deny-by-default.
 */
export interface AuthenticatedRequest {
  params: Record<string, string | undefined>;
  principal?: Principal;
  bindings?: PolicyBinding[];
}

/**
 * Reads the org/project/environment hierarchy off route params. Segments
 * that aren't present on a given route are left undefined; `orgId` defaults
 * to `''` since `ResourceScope` requires it, but platform-scoped bindings
 * ignore it entirely and org/project/environment bindings never match an
 * empty scope id, so an unresolvable org still denies correctly.
 */
export function resourceScopeFromParams(request: AuthenticatedRequest): ResourceScope {
  return {
    orgId: request.params.orgId ?? '',
    projectId: request.params.projectId,
    environmentId: request.params.environmentId,
  };
}
