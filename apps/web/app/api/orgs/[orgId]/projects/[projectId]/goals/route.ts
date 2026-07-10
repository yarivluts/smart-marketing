import { NextResponse, type NextRequest } from 'next/server';
import { InvalidGoalError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { createGoal } from '@/lib/orgs/mutations';
import { listGoalsForProject } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseCreateGoalRequestBody } from '@/lib/orgs/parse-goal-fields';
import { toGoalSummaryView } from '@/lib/orgs/goal-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Lists every goal in a project (KAN-64), deadline-sorted — gated on `dashboards.write`, reusing the boards feature's permission (see this story's PR description for why a dedicated `goals.manage` permission is out of scope). */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  try {
    const goals = await listGoalsForProject(orgId, projectId);
    return NextResponse.json({ goals: goals.map(toGoalSummaryView) });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}

/** Creates a goal (KAN-64, E12.1). */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  const parsed = await parseCreateGoalRequestBody(request);
  if (parsed.error) {
    return parsed.error;
  }

  try {
    const goal = await createGoal({
      organizationId: orgId,
      projectId,
      name: parsed.name,
      metricName: parsed.metricName,
      direction: parsed.direction,
      ...(parsed.targetValue !== undefined ? { targetValue: parsed.targetValue } : {}),
      ...(parsed.rangeMin !== undefined ? { rangeMin: parsed.rangeMin } : {}),
      ...(parsed.rangeMax !== undefined ? { rangeMax: parsed.rangeMax } : {}),
      startDate: parsed.startDate,
      deadline: parsed.deadline,
      rhythm: parsed.rhythm,
      ownerPersonId: parsed.ownerPersonId,
      createdByUserId: user.id,
    });
    return NextResponse.json({ goal: toGoalSummaryView(goal) }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidGoalError) {
      return NextResponse.json({ error: 'invalid_goal', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}
