import { NextResponse, type NextRequest } from 'next/server';
import { ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { archiveProject, unarchiveProject } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Archives (`{ archived: true }`) or unarchives (`{ archived: false }`) a
 * project — see `archiveProject`'s own doc comment. Gated on
 * `project.manage`, the same org-level admin permission the project
 * settings route uses; a project switcher hides an archived project, so
 * only the settings page (which lists archived ones) can reverse it.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'project.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ archived?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { archived } = parsed.body;
  if (typeof archived !== 'boolean') {
    return NextResponse.json({ error: 'archived_required' }, { status: 400 });
  }

  try {
    const project = archived ? await archiveProject(orgId, projectId, user.id) : await unarchiveProject(orgId, projectId, user.id);
    return NextResponse.json({ project: { id: project.id, name: project.name, archivedAt: project.archived_at ?? null } });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
