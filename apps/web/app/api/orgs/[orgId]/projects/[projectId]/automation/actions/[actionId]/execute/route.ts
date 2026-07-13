import { NextResponse, type NextRequest } from 'next/server';
import {
  AutomationActionInvalidStateError,
  AutomationActionNotFoundError,
  AutomationKillSwitchEngagedError,
  InsufficientWriteTierError,
  ProjectNotFoundError,
} from '@growthos/firebase-orm-models';
import { executeAutomationAction } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; actionId: string }>;
}

/**
 * Executes an `approved` action (KAN-71's execute step) — always returns
 * 200 with the action's resulting status even when the executor itself
 * failed, since `executeAutomationAction` already turns a failure into a
 * terminal `failed` status rather than throwing (retries are exhausted
 * inside the service call).
 */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, actionId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  try {
    const action = await executeAutomationAction(orgId, projectId, actionId, user.id);
    return NextResponse.json({ id: action.id, status: action.status, failureReason: action.failure_reason });
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
    if (err instanceof InsufficientWriteTierError) {
      return NextResponse.json({ error: 'insufficient_write_tier' }, { status: 409 });
    }
    throw err;
  }
}
