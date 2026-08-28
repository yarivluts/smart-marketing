import { NextResponse } from 'next/server';
import type { UserModel, UserOrgMembership } from '@growthos/firebase-orm-models';
import { can, type Permission } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';

/**
 * The signed-in user's active (non-pending, non-suspended) membership in an
 * org, if any. Used as the org-existence/visibility gate ahead of a `can()`
 * permission check on every org-scoped page and API route:
 * `resolveOrgSessionContext`'s memberships list only contains orgs the user
 * actually has a `Membership` row in, so a principal whose only access to an
 * org came from a platform-scoped binding (no per-org membership doc) would
 * be denied here even though `can()` would otherwise grant it via scope
 * inheritance. That's fine today — nothing in this codebase provisions
 * platform-scoped bindings yet — but worth revisiting once a real
 * `platform_admin` path exists.
 *
 * A `suspended` membership is excluded the same way `invited` already was —
 * `suspendOrgMember` removes the role binding this predicate's callers would
 * otherwise `can()`-check next, so treating a suspended membership as active
 * here would only earn the caller the same 403 a non-member gets, without
 * the KAN-26 non-enumeration benefit of the 404 a non-member (or, until this
 * change, a suspended member) actually gets.
 */
export function findActiveMembership(
  memberships: readonly UserOrgMembership[],
  organizationId: string,
): UserOrgMembership | undefined {
  return memberships.find(
    (membership) => membership.organizationId === organizationId && (membership.status ?? 'active') === 'active',
  );
}

export type OrgPermissionResult = { user: UserModel; error?: undefined } | { user?: undefined; error: NextResponse };

/**
 * The `getServerSession -> resolveOrgSessionContext -> findActiveMembership`
 * sequence every org-scoped route needs before doing anything else: 401 if
 * there's no session at all.
 *
 * KAN-26 non-enumeration: "org doesn't exist" and "org exists but the caller
 * has no active membership in it" must be indistinguishable to the caller —
 * both return 404, never 403, since a 403 would confirm the org's existence
 * to someone who shouldn't even know it.
 *
 * Use this directly (not {@link requireOrgPermission}) for routes any active
 * member may read regardless of role — e.g. browsing the KAN-27 Org
 * Resource Library to pick something to request — since `viewer` legitimately
 * holds zero permissions in `ROLE_PERMISSIONS` and would otherwise be denied
 * read access it's meant to have.
 */
export async function requireOrgMembership(organizationId: string): Promise<OrgPermissionResult> {
  const session = await getServerSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }

  const { user, memberships } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, organizationId);
  if (!membership) {
    return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) };
  }

  return { user };
}

/**
 * {@link requireOrgMembership} plus a `can()` check for a specific
 * permission. Once the caller *is* a real, active member (so the org's
 * existence is already known to them), a missing permission for the
 * requested action is a normal 403 — that doesn't leak anything they don't
 * already know.
 */
export async function requireOrgPermission(
  organizationId: string,
  permission: Permission,
): Promise<OrgPermissionResult> {
  const session = await getServerSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, organizationId);
  if (!membership) {
    return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) };
  }
  if (!can(bindings, { type: 'user', id: user.id }, permission, { orgId: organizationId })) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }

  return { user };
}
