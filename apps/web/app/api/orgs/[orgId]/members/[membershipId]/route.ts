import { NextResponse } from 'next/server';
import { LastOwnerError, MembershipNotFoundError } from '@growthos/firebase-orm-models';
import { removeMember } from '@/lib/orgs/mutations';
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
