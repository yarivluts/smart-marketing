import { NextResponse } from 'next/server';
import type { UserModel, UserOrgMembership } from '@growthos/firebase-orm-models';
import { can, type Permission } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';

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

export type OrgPermissionResult = { user: UserModel; error?: undefined } | { user?: undefined; error: NextResponse };

/**
 * The `getServerSession -> resolveOrgSessionContext -> findActiveMembership
 * -> can()` sequence every org-scoped mutating route needs before doing
 * anything else: 401 if there's no session at all, 403 if the caller has no
 * active membership in this org or the permission itself is missing.
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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, permission, { orgId: organizationId })) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }

  return { user };
}
