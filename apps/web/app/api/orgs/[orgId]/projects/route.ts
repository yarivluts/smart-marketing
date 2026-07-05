import { NextResponse, type NextRequest } from 'next/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { createProject } from '@/lib/orgs/mutations';
import { findActiveMembership } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/** Creates a project in an org — requires `project.manage` at the org scope. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId } = await params;
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'project.manage', { orgId })) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = await parseJsonBody<{ name?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { name } = parsed.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }

  const { project } = await createProject({ organizationId: orgId, name: name.trim() });
  return NextResponse.json({ projectId: project.id }, { status: 201 });
}
