import type { UserOrgMembership } from '@growthos/firebase-orm-models';

/**
 * The signed-in user's active (non-pending) membership in an org, if any.
 * Used as the org-existence/visibility gate ahead of a `can()` permission
 * check on every org-scoped page and API route: `resolveOrgSessionContext`'s
 * memberships list only contains orgs the user actually has a `Membership`
 * row in, so a principal whose only access to an org came from a
 * platform-scoped binding (no per-org membership doc) would be denied here
 * even though `can()` would otherwise grant it via scope inheritance. That's
 * fine today — nothing in this codebase provisions platform-scoped bindings
 * yet — but worth revisiting once a real `platform_admin` path exists.
 */
export function findActiveMembership(
  memberships: readonly UserOrgMembership[],
  organizationId: string,
): UserOrgMembership | undefined {
  return memberships.find(
    (membership) => membership.organizationId === organizationId && membership.status !== 'invited',
  );
}
