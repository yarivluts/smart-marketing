import { NextResponse, type NextRequest } from 'next/server';
import { updateAutopilotGuardrails, ProjectNotFoundError } from '@growthos/firebase-orm-models';
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

  const parsed = await parseJsonBody<{
    dailyCapUsd?: number;
    minRoasFloor?: number;
    maxCpaCeiling?: number;
    maxShiftVelocityPct?: number;
    killSwitchEngaged?: boolean;
  }>(request);

  if (parsed.error) {
    return parsed.error;
  }

  try {
    const updated = await updateAutopilotGuardrails(orgId, projectId, parsed.body, user.id);
    return NextResponse.json({ ok: true, guardrails: updated });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'project_not_found' }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: 'update_failed', message }, { status: 500 });
  }
}
