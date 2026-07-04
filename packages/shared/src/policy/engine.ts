import type { Permission } from './permissions';
import { roleHasPermission, type Role } from './roles';
import type { PrincipalType } from './principal';
import type { ScopeLevel } from './scopes';

/** A granted role binding, shaped like `RoleBindingModel` but framework-agnostic. */
export interface PolicyBinding {
  principalType: PrincipalType;
  principalId: string;
  role: Role;
  scopeLevel: ScopeLevel;
  /** Id of the org/project/environment the binding is scoped to. Ignored for `platform`. */
  scopeId: string;
}

/** The resource a permission is being checked against, identified down to its leaf. */
export interface ResourceScope {
  orgId: string;
  projectId?: string;
  environmentId?: string;
}

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
}

/**
 * Deny-by-default: a binding only grants access to its own scope and every
 * scope nested beneath it (platform -> org -> project -> environment). It
 * never grants access upward (a project binding cannot satisfy an org-level
 * check) or sideways (a binding on one project/environment does not cover a
 * sibling one).
 */
function bindingCoversResource(binding: PolicyBinding, resource: ResourceScope): boolean {
  switch (binding.scopeLevel) {
    case 'platform':
      return true;
    case 'org':
      return binding.scopeId === resource.orgId;
    case 'project':
      return resource.projectId !== undefined && binding.scopeId === resource.projectId;
    case 'environment':
      return resource.environmentId !== undefined && binding.scopeId === resource.environmentId;
    default:
      return false;
  }
}

/**
 * Evaluates whether `principal` may perform `permission` on `resource`, given
 * the full set of role bindings visible to the caller. Deny-by-default: an
 * empty or non-matching binding set always denies.
 */
export function evaluate(
  bindings: readonly PolicyBinding[],
  principal: { type: PrincipalType; id: string },
  permission: Permission,
  resource: ResourceScope,
): PolicyDecision {
  for (const binding of bindings) {
    if (binding.principalType !== principal.type || binding.principalId !== principal.id) {
      continue;
    }
    if (!bindingCoversResource(binding, resource)) {
      continue;
    }
    if (roleHasPermission(binding.role, permission)) {
      return {
        allowed: true,
        reason: `${principal.type}:${principal.id} has ${binding.role} at ${binding.scopeLevel}:${binding.scopeId}, which grants ${permission}`,
      };
    }
  }
  return {
    allowed: false,
    reason: `no role binding grants ${permission} to ${principal.type}:${principal.id} on this resource (deny-by-default)`,
  };
}

/** Boolean convenience wrapper around {@link evaluate}. */
export function can(
  bindings: readonly PolicyBinding[],
  principal: { type: PrincipalType; id: string },
  permission: Permission,
  resource: ResourceScope,
): boolean {
  return evaluate(bindings, principal, permission, resource).allowed;
}
