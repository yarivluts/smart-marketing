import { NextResponse, type NextRequest } from 'next/server';
import { InvalidAutomationActionError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { ensureAutomationTargetSeeded } from '@/lib/orgs/mutations';
import { listAutomationTargetStatesForProject } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Every simulated automation target seeded for a project (KAN-71's buildable-today stand-in for "the ad platform's own campaign list" — see `AutomationTargetStateModel`'s own doc comment). */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  const targets = await listAutomationTargetStatesForProject(orgId, projectId);
  return NextResponse.json({
    targets: targets.map((target) => ({
      id: target.id,
      targetType: target.target_type,
      label: target.label,
      dailyBudgetUsd: target.daily_budget_usd,
      environmentId: target.environment_id,
      updatedAt: target.updated_at,
    })),
  });
}

/** Seeds (idempotent get-or-create) a new simulated target — the demo/test-data step a real KAN-72/73 connector would replace by discovering the org's actual live campaigns. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{
    targetId?: unknown;
    environmentId?: unknown;
    targetType?: unknown;
    label?: unknown;
    initialDailyBudgetUsd?: unknown;
  }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { targetId, environmentId, targetType, label, initialDailyBudgetUsd } = parsed.body;
  if (typeof targetId !== 'string' || targetId.trim().length === 0) {
    return NextResponse.json({ error: 'target_id_required' }, { status: 400 });
  }
  if (typeof environmentId !== 'string' || environmentId.trim().length === 0) {
    return NextResponse.json({ error: 'environment_id_required' }, { status: 400 });
  }
  if (typeof targetType !== 'string' || targetType.trim().length === 0) {
    return NextResponse.json({ error: 'target_type_required' }, { status: 400 });
  }
  if (typeof label !== 'string' || label.trim().length === 0) {
    return NextResponse.json({ error: 'label_required' }, { status: 400 });
  }
  if (typeof initialDailyBudgetUsd !== 'number') {
    return NextResponse.json({ error: 'initial_daily_budget_usd_required' }, { status: 400 });
  }

  try {
    const target = await ensureAutomationTargetSeeded({
      organizationId: orgId,
      projectId,
      environmentId,
      targetId: targetId.trim(),
      targetType: targetType.trim(),
      label: label.trim(),
      initialDailyBudgetUsd,
      seededByUserId: user.id,
    });
    return NextResponse.json({ id: target.id, dailyBudgetUsd: target.daily_budget_usd }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidAutomationActionError) {
      return NextResponse.json({ error: 'invalid_initial_daily_budget_usd' }, { status: 400 });
    }
    throw err;
  }
}
