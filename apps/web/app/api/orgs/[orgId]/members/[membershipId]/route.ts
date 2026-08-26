import { NextResponse } from 'next/server';
import { isInvitableRole, LastOwnerError, MembershipNotFoundError, RoleNotChangeableError } from '@growthos/firebase-orm-models';
import { removeMember, updateMemberRole } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; membershipId: string }>;
}

/**
 * Revokes a pending invite or removes an active member — requires
 * `members.manage` at the org scope, the same permission that gates sending
 * an invite in the first place (see `requireOrgPermission`).
 */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, membershipId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'members.manage');
  if (error) {
    return error;
  }

  try {
    await removeMember({ organizationId: orgId, membershipId, performedByUserId: user.id });
    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    if (err instanceof MembershipNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof LastOwnerError) {
      return NextResponse.json({ error: 'last_owner' }, { status: 409 });
    }
    throw err;
  }
}

/**
 * Changes a member's role between `org_admin` and `viewer` — the "change
 * role" surface `removeMember`'s only prior alternative (revoke +
 * re-invite) never provided. Same `members.manage` gate as `DELETE`.
 */
export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, membershipId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'members.manage');
  if (error) {
    return error;
  }

  const body = (await request.json().catch(() => null)) as { role?: string } | null;
  if (!body || typeof body.role !== 'string' || !isInvitableRole(body.role)) {
    return NextResponse.json({ error: 'invalid_role' }, { status: 400 });
  }

  try {
    const membership = await updateMemberRole({
      organizationId: orgId,
      membershipId,
      role: body.role,
      performedByUserId: user.id,
    });
    return NextResponse.json({ role: membership.role });
  } catch (err) {
    if (err instanceof MembershipNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof RoleNotChangeableError) {
      return NextResponse.json({ error: 'role_not_changeable' }, { status: 409 });
    }
    throw err;
  }
}
