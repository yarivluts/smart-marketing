import { NextResponse, type NextRequest } from 'next/server';
import { AutomationActionInvalidStateError, AutomationActionNotFoundError, AutomationKillSwitchEngagedError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { approveAutomationAction } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; actionId: string }>;
}

/** Approves an `awaiting_approval` action — requires `automation.approve`, distinct from the `automation.execute` every other automation route requires. */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, actionId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.approve');
  if (error) {
    return error;
  }

  try {
    const action = await approveAutomationAction(orgId, projectId, actionId, user.id);
    return NextResponse.json({ id: action.id, status: action.status });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof AutomationActionNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof AutomationActionInvalidStateError) {
      return NextResponse.json({ error: 'invalid_state' }, { status: 409 });
    }
    if (err instanceof AutomationKillSwitchEngagedError) {
      return NextResponse.json({ error: 'kill_switch_engaged' }, { status: 409 });
    }
    throw err;
  }
}
