import { NextResponse, type NextRequest } from 'next/server';
import { GoalNotFoundError } from '@growthos/firebase-orm-models';
import { deleteGoal } from '@/lib/orgs/mutations';
import { getGoal, queryGoalProgress } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
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
      targetValue: goal.target_value,
      rangeMin: goal.range_min,
      rangeMax: goal.range_max,
      startDate: goal.start_date,
      rhythm: goal.rhythm,
    },
    thermometer: buildGoalThermometerView(outcome),
  });
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
