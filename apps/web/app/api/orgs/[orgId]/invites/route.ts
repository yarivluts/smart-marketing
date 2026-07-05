import { NextResponse, type NextRequest } from 'next/server';
import { can, isInvitableRole } from '@growthos/shared';
import { MembershipAlreadyExistsError } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { inviteMember } from '@/lib/orgs/mutations';
import { findActiveMembership } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/** Invites someone to an org by email — requires `members.manage` at the org scope. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId } = await params;
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'members.manage', { orgId })) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = await parseJsonBody<{ email?: unknown; role?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { email, role } = parsed.body;
  if (typeof email !== 'string' || email.trim().length === 0) {
    return NextResponse.json({ error: 'email_required' }, { status: 400 });
  }
  if (typeof role !== 'string' || !isInvitableRole(role)) {
    return NextResponse.json({ error: 'invalid_role' }, { status: 400 });
  }

  try {
    const invitation = await inviteMember({
      organizationId: orgId,
      email: email.trim(),
      role,
      invitedByUserId: user.id,
    });
    return NextResponse.json({ membershipId: invitation.id }, { status: 201 });
  } catch (error) {
    if (error instanceof MembershipAlreadyExistsError) {
      return NextResponse.json({ error: 'already_member' }, { status: 409 });
    }
    throw error;
  }
}
