import { NextResponse, type NextRequest } from 'next/server';
import { AutomationTargetNotFoundError, InvalidAutomationActionError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { proposeAutomationBudgetChangeAction } from '@/lib/orgs/mutations';
import { listAutomationActionsForProject } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** A project's KAN-71 automation action queue/history, newest-proposal-first. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  const actions = await listAutomationActionsForProject(orgId, projectId);
  return NextResponse.json({
    actions: actions.map((action) => ({
      id: action.id,
      targetId: action.target_id,
      targetLabel: action.target_label,
      before: action.before,
      after: action.after,
      status: action.status,
      guardrailViolations: action.guardrail_violations,
      proposedAt: action.proposed_at,
      approvedAt: action.approved_at,
      executedAt: action.executed_at,
      failureReason: action.failure_reason,
      verifiedAt: action.verified_at,
      guardedMetricRegressionPct: action.guarded_metric_regression_pct,
      rolledBackAt: action.rolled_back_at,
      rollbackReason: action.rollback_reason,
    })),
  });
}

/** Proposes a simulated budget-change action — KAN-71's dry-run-diff step. Lands as `blocked` or `awaiting_approval` depending on the project's guardrail policy. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ targetId?: unknown; afterDailyBudgetUsd?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { targetId, afterDailyBudgetUsd } = parsed.body;
  if (typeof targetId !== 'string' || targetId.trim().length === 0) {
    return NextResponse.json({ error: 'target_id_required' }, { status: 400 });
  }
  if (typeof afterDailyBudgetUsd !== 'number') {
    return NextResponse.json({ error: 'after_daily_budget_usd_required' }, { status: 400 });
  }

  try {
    const action = await proposeAutomationBudgetChangeAction({
      organizationId: orgId,
      projectId,
      targetId,
      afterDailyBudgetUsd,
      requestedByUserId: user.id,
    });
    return NextResponse.json({ id: action.id, status: action.status, guardrailViolations: action.guardrail_violations }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof AutomationTargetNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidAutomationActionError) {
      return NextResponse.json({ error: 'invalid_after_daily_budget_usd' }, { status: 400 });
    }
    throw err;
  }
}
