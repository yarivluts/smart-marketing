import { NextResponse } from 'next/server';
import { LastOwnerError, MembershipNotActiveError, MembershipNotFoundError } from '@growthos/firebase-orm-models';
import { suspendMember } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; membershipId: string }>;
}

/**
 * Pauses an active member's access without removing their membership (KAN-132
 * — `MembershipModel`'s own doc comment named `suspended` as a status the
 * codebase carried since KAN-25 but never actually wrote or enforced). Same
 * `members.manage` gate as `DELETE`/`PATCH` on this resource, and the same
 * last-active-owner guard `DELETE` already enforces — see `suspendOrgMember`'s
 * doc comment.
 */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, membershipId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'members.manage');
  if (error) {
    return error;
  }

  try {
    const membership = await suspendMember({ organizationId: orgId, membershipId, performedByUserId: user.id });
    return NextResponse.json({ status: membership.status });
  } catch (err) {
    if (err instanceof MembershipNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof MembershipNotActiveError) {
      return NextResponse.json({ error: 'not_active' }, { status: 409 });
    }
    if (err instanceof LastOwnerError) {
      return NextResponse.json({ error: 'last_owner' }, { status: 409 });
    }
    throw err;
  }
}
