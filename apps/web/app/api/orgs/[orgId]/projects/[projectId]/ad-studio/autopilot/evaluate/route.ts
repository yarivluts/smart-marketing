import { NextResponse, type NextRequest } from 'next/server';
import { executeAutopilotOptimizationCycle, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  try {
    const result = await executeAutopilotOptimizationCycle(orgId, projectId, user.id);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'project_not_found' }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : 'Unknown evaluation error';
    return NextResponse.json({ error: 'evaluation_failed', message }, { status: 500 });
  }
}
