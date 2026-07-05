import { NextResponse, type NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { createOrganization } from '@/lib/orgs/mutations';
import { parseJsonBody } from '@/lib/http/parse-json-body';

/**
 * Creates a new organization with the signed-in user as its `org_owner`.
 * Anyone signed in may create an org (see `createOrganizationWithOwner`'s
 * doc comment — a brand-new org has no role bindings to gate this behind).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const parsed = await parseJsonBody<{ name?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { name } = parsed.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }

  const { user } = await resolveOrgSessionContext(session);
  const { organization } = await createOrganization({ name: name.trim(), ownerUserId: user.id });
  return NextResponse.json({ organizationId: organization.id }, { status: 201 });
}
