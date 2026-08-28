import { NextResponse } from 'next/server';
import { MembershipNotFoundError, MembershipNotSuspendedError } from '@growthos/firebase-orm-models';
import { reactivateMember } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; membershipId: string }>;
}

/** Restores a suspended member's access — the reverse of `POST .../suspend`. Same `members.manage` gate. */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, membershipId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'members.manage');
  if (error) {
    return error;
  }

  try {
    const membership = await reactivateMember({ organizationId: orgId, membershipId, performedByUserId: user.id });
    return NextResponse.json({ status: membership.status });
  } catch (err) {
    if (err instanceof MembershipNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof MembershipNotSuspendedError) {
      return NextResponse.json({ error: 'not_suspended' }, { status: 409 });
    }
    throw err;
  }
}
