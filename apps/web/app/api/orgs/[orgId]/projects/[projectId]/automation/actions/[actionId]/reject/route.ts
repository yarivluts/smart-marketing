import { NextResponse, type NextRequest } from 'next/server';
import { AutomationActionInvalidStateError, AutomationActionNotFoundError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { rejectAutomationAction } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; actionId: string }>;
}

/** Rejects a `blocked` or `awaiting_approval` action, same `automation.approve` gate as approving one. */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, actionId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.approve');
  if (error) {
    return error;
  }

  try {
    const action = await rejectAutomationAction(orgId, projectId, actionId, user.id);
    return NextResponse.json({ id: action.id, status: action.status });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof AutomationActionNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof AutomationActionInvalidStateError) {
      return NextResponse.json({ error: 'invalid_state' }, { status: 409 });
    }
    throw err;
  }
}
