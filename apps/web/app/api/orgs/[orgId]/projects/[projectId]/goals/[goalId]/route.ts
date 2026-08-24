import { NextResponse, type NextRequest } from 'next/server';
import { GoalNotFoundError, InvalidGoalError } from '@growthos/firebase-orm-models';
import { deleteGoal, updateGoal } from '@/lib/orgs/mutations';
import { getGoal, queryGoalProgress } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseUpdateGoalRequestBody } from '@/lib/orgs/parse-goal-fields';
import { buildGoalThermometerView, toGoalSummaryView } from '@/lib/orgs/goal-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; goalId: string }>;
}

/** One goal's own settings plus its computed progress thermometer (KAN-64) — mirrors the board detail page's "settings + per-tile query outcome" split, at the single-goal grain. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, goalId } = await params;
  const { error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  const goal = await getGoal(orgId, projectId, goalId);
  if (!goal) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const outcome = await queryGoalProgress(orgId, projectId, goal);
  return NextResponse.json({
    goal: {
      ...toGoalSummaryView(goal),
      startDate: goal.start_date,
      rhythm: goal.rhythm,
    },
    thermometer: buildGoalThermometerView(outcome),
  });
}

/**
 * Updates a goal's own target value (or range) (KAN-85, plan `14 §Gap 15`'s
 * "inline editing... of targets/values directly in report tables") — the
 * PATCH commit path the goals table's inline target cell (`GoalTargetInput`)
 * fires on blur. Gated on the same `dashboards.write` permission every other
 * mutation on this route uses.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, goalId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  const parsed = await parseUpdateGoalRequestBody(request);
  if (parsed.error) {
    return parsed.error;
  }

  try {
    const goal = await updateGoal(orgId, projectId, goalId, parsed, user.id);
    return NextResponse.json({ goal: toGoalSummaryView(goal) });
  } catch (err) {
    if (err instanceof GoalNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidGoalError) {
      return NextResponse.json({ error: 'invalid_goal', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}

/** Deletes a goal outright (see `deleteGoal`'s own doc comment for why a goal, like a board, has no keep-forever audit requirement of its own). */
export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, goalId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  try {
    await deleteGoal(orgId, projectId, goalId, user.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof GoalNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
