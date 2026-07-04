/**
 * Role and scope vocabulary for the org -> project -> environment hierarchy.
 * The full permission catalog + policy engine is KAN-23; this is the seed the
 * models reference so bindings are typed from the start.
 */

/** Level at which a role binding applies. Inheritance flows org -> project -> env. */
export const SCOPE_LEVELS = ['org', 'project', 'environment'] as const;
export type ScopeLevel = (typeof SCOPE_LEVELS)[number];

/** Coarse built-in role bundles. Fine-grained permissions land with KAN-23. */
export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/** The kind of principal a role binding or membership can grant access to. */
export const PRINCIPAL_TYPES = ['user', 'service_account'] as const;
export type PrincipalType = (typeof PRINCIPAL_TYPES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
