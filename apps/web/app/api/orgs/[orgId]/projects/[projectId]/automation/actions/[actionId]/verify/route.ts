import { NextResponse, type NextRequest } from 'next/server';
import { AutomationActionInvalidStateError, AutomationActionNotFoundError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { verifyAutomationAction } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; actionId: string }>;
}

/**
 * Verifies an `executed` action (KAN-71's verify step). An optional
 * `guardedMetricBefore`/`guardedMetricAfter` pair — the observed business
 * metric a human read off the ad platform's own dashboard today, until
 * KAN-72/73 can supply it automatically — triggers an auto-rollback when the
 * metric regressed past the project's guardrail policy threshold.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, actionId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ guardedMetricBefore?: unknown; guardedMetricAfter?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { guardedMetricBefore, guardedMetricAfter } = parsed.body;
  if (
    (guardedMetricBefore !== undefined && typeof guardedMetricBefore !== 'number') ||
    (guardedMetricAfter !== undefined && typeof guardedMetricAfter !== 'number')
  ) {
    return NextResponse.json({ error: 'invalid_guarded_metric' }, { status: 400 });
  }

  try {
    const action = await verifyAutomationAction({
      organizationId: orgId,
      projectId,
      actionId,
      verifiedByUserId: user.id,
      guardedMetricBefore: guardedMetricBefore as number | undefined,
      guardedMetricAfter: guardedMetricAfter as number | undefined,
    });
    return NextResponse.json({ id: action.id, status: action.status, guardedMetricRegressionPct: action.guarded_metric_regression_pct });
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
