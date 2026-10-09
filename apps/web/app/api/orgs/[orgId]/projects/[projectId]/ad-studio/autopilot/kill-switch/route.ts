import { NextResponse, type NextRequest } from 'next/server';
import { toggleAutopilotKillSwitch, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ engaged: boolean; reason?: string }>(request);
  if (parsed.error) {
    return parsed.error;
  }

  const { engaged, reason } = parsed.body;
  if (typeof engaged !== 'boolean') {
    return NextResponse.json({ error: 'invalid_engaged_status' }, { status: 400 });
  }

  try {
    await toggleAutopilotKillSwitch(
      orgId,
      projectId,
      engaged,
      reason ?? (engaged ? 'Emergency kill switch triggered' : 'Autopilot operations resumed'),
      user.id,
    );
    return NextResponse.json({ ok: true, engaged });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'project_not_found' }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: 'kill_switch_failed', message }, { status: 500 });
  }
}
