import { NextResponse } from 'next/server';
import {
  EmailNotVerifiedError,
  InviteAlreadyResolvedError,
  InviteEmailMismatchError,
  InviteNotFoundError,
} from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { acceptInvite } from '@/lib/orgs/mutations';

interface RouteParams {
  params: Promise<{ orgId: string; membershipId: string }>;
}

/**
 * Accepts a pending org invite for the signed-in principal. The
 * email-mismatch check happens by identity inside `acceptInvite` (comparing
 * `UserModel.id`s, not raw email strings) — see `invite.service.ts`. Also
 * requires the session's email to be verified: without it, anyone who merely
 * knows the invitee's email could sign up with it first and hijack the
 * invite before the real invitee ever gets the chance (see
 * `EmailNotVerifiedError`'s doc comment).
 */
export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, membershipId } = await params;
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { user } = await resolveOrgSessionContext(session);

  try {
    await acceptInvite({
      organizationId: orgId,
      membershipId,
      userId: user.id,
      callerEmailVerified: session.email_verified === true,
    });
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    if (error instanceof InviteNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (error instanceof InviteEmailMismatchError) {
      return NextResponse.json({ error: 'email_mismatch' }, { status: 403 });
    }
    if (error instanceof EmailNotVerifiedError) {
      return NextResponse.json({ error: 'email_not_verified' }, { status: 403 });
    }
    if (error instanceof InviteAlreadyResolvedError) {
      return NextResponse.json({ error: 'already_resolved' }, { status: 409 });
    }
    throw error;
  }
}
