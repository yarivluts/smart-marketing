import { NextResponse, type NextRequest } from 'next/server';
import { InvalidSessionReplayUrlTemplateError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { setProjectSessionReplayUrlTemplate } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Sets (or clears, with an empty string) the project's session-replay
 * deep-link template. Gated on `project.manage` — the same per-project
 * admin-config permission the cost-guardrail quota route uses, and the same
 * shape of setting: project-level admin configuration, not metrics
 * authoring.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'project.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ template?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }

  const { template } = parsed.body;
  if (template !== undefined && typeof template !== 'string') {
    return NextResponse.json({ error: 'invalid_template' }, { status: 400 });
  }

  try {
    const project = await setProjectSessionReplayUrlTemplate({
      organizationId: orgId,
      projectId,
      template,
      setByUserId: user.id,
    });
    return NextResponse.json({ template: project.session_replay_url_template ?? '' }, { status: 200 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidSessionReplayUrlTemplateError) {
      return NextResponse.json({ error: 'invalid_template' }, { status: 400 });
    }
    throw err;
  }
}
