import { NextResponse, type NextRequest } from 'next/server';
import { can, isInviteRole, isProjectInvitableRole } from '@growthos/shared';
import {
  MembershipAlreadyExistsError,
  ProjectNotFoundError,
  ProjectRequiredForRoleError,
  ProjectScopedRoleNotAllowedError,
} from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { inviteMember } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/**
 * Invites someone to an org by email — requires `members.manage` at the org
 * scope. `role` may be an org-scoped role (`org_admin`/`viewer`, no
 * `projectId`) or a project-scoped role (`project_admin`/`editor`/
 * `operator` — see `invitableRolesForScope('project')`), which requires a
 * `projectId` naming a project the caller actually administers
 * (`project.manage` — an org-scope binding satisfies this for every project
 * in the org, a project-scope one only for its own project).
 *
 * `members.manage` alone doesn't literally prove `project.manage` on the
 * named project, so this re-derives the caller's raw bindings the same way
 * `omnisearch/route.ts` does (see its own doc comment) to run that second,
 * project-scoped `can()` check explicitly — the correct authorization
 * boundary for the resource actually being granted, rather than leaning on
 * `ROLE_PERMISSIONS` always bundling `members.manage` with `project.manage`
 * in every role today (true now, but not guaranteed to stay true if a
 * future role decouples them). `inviteMemberToOrganization`
 * (`invite.service.ts`) separately validates that `projectId` actually
 * belongs to this org (`ProjectNotFoundError`, 404) — a check this route
 * can't skip even after the `can()` check above passes, since an org-scope
 * binding satisfies `project.manage` for *any* `projectId` string
 * regardless of whether a project with that id exists at all.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'members.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ email?: unknown; role?: unknown; projectId?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { email, role, projectId } = parsed.body;
  if (typeof email !== 'string' || email.trim().length === 0) {
    return NextResponse.json({ error: 'email_required' }, { status: 400 });
  }
  if (typeof role !== 'string' || !isInviteRole(role)) {
    return NextResponse.json({ error: 'invalid_role' }, { status: 400 });
  }
  if (projectId !== undefined && (typeof projectId !== 'string' || projectId.trim().length === 0)) {
    return NextResponse.json({ error: 'invalid_project' }, { status: 400 });
  }

  const projectScoped = isProjectInvitableRole(role);
  if (projectScoped && !projectId) {
    return NextResponse.json({ error: 'project_required' }, { status: 400 });
  }
  if (!projectScoped && projectId !== undefined) {
    return NextResponse.json({ error: 'project_not_allowed' }, { status: 400 });
  }

  if (projectScoped && projectId) {
    const session = await getServerSession();
    if (!session) {
      // Unreachable: requireOrgPermission above already required a session.
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    const { bindings } = await resolveOrgSessionContext(session);
    if (!can(bindings, { type: 'user', id: user.id }, 'project.manage', { orgId, projectId })) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  try {
    const invitation = await inviteMember({
      organizationId: orgId,
      email: email.trim(),
      role,
      invitedByUserId: user.id,
      projectId: projectScoped ? (projectId as string) : undefined,
    });
    return NextResponse.json({ membershipId: invitation.id }, { status: 201 });
  } catch (error) {
    if (error instanceof MembershipAlreadyExistsError) {
      return NextResponse.json({ error: 'already_member' }, { status: 409 });
    }
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'project_not_found' }, { status: 404 });
    }
    if (error instanceof ProjectRequiredForRoleError || error instanceof ProjectScopedRoleNotAllowedError) {
      return NextResponse.json({ error: 'invalid_role' }, { status: 400 });
    }
    throw error;
  }
}
