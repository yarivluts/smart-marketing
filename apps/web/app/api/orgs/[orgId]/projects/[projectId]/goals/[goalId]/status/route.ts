import { NextResponse, type NextRequest } from 'next/server';
import { GoalNotFoundError, isGoalStatus } from '@growthos/firebase-orm-models';
import { setGoalStatus } from '@/lib/orgs/mutations';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { toGoalSummaryView } from '@/lib/orgs/goal-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; goalId: string }>;
}

/**
 * Pauses or resumes a goal (see `setGoalStatus`'s own doc comment) — kept
 * off the sibling `PATCH` route on purpose: that route dispatches between
 * two mutually-exclusive edit shapes by which fields the body names, and a
 * status flip is neither. Same `dashboards.write` gate as every goal
 * mutation.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, goalId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'dashboards.write');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ status?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { status } = parsed.body;
  if (typeof status !== 'string' || !isGoalStatus(status)) {
    return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
  }

  try {
    const goal = await setGoalStatus(orgId, projectId, goalId, status, user.id);
    return NextResponse.json({ goal: { ...toGoalSummaryView(goal), status: goal.status ?? 'active' } });
  } catch (err) {
    if (err instanceof GoalNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
