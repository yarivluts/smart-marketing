import { NextResponse, type NextRequest } from 'next/server';
import { InvalidProjectNameError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { updateProjectDetails } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

interface UpdateProjectRequestBody {
  name?: unknown;
  vertical?: unknown;
}

/**
 * Edits a project's own `name`/`vertical` — the same "create + list only,
 * no way to fix a typo'd definition" gap KAN-100/117/119/120/121 already
 * closed for their own sibling registries. Gated on `project.manage`, the
 * same per-project admin-config permission the session-replay and
 * cost-guardrail routes use. `session_replay_url_template` has its own
 * dedicated route (`.../session-replay`) and is untouched here.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'project.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<UpdateProjectRequestBody>(request);
  if (parsed.error) {
    return parsed.error;
  }

  const { name, vertical } = parsed.body;
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }
  if (vertical !== undefined && typeof vertical !== 'string') {
    return NextResponse.json({ error: 'invalid_vertical' }, { status: 400 });
  }

  try {
    const project = await updateProjectDetails({
      organizationId: orgId,
      projectId,
      name,
      vertical,
      actorUserId: user.id,
    });
    return NextResponse.json({
      project: { id: project.id, name: project.name, vertical: project.vertical ?? '' },
    });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidProjectNameError) {
      return NextResponse.json({ error: 'name_required' }, { status: 400 });
    }
    throw err;
  }
}
