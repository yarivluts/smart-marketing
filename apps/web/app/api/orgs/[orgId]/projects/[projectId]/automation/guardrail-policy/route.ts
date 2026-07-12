import { NextResponse, type NextRequest } from 'next/server';
import { InvalidAutomationActionError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { setAutomationGuardrailPolicy } from '@/lib/orgs/mutations';
import { getActiveAutomationGuardrailPolicy } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** A project's KAN-71 automation guardrail policy — gated on `automation.execute`, the same permission approving/executing an action itself requires. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  try {
    const policy = await getActiveAutomationGuardrailPolicy(orgId, projectId);
    return NextResponse.json(policy);
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}

interface GuardrailPolicyBody {
  maxDailyBudgetChangePct?: unknown;
  spendCeilingUsd?: unknown;
  protectedTargetIds?: unknown;
  allowedHoursStartHourUtc?: unknown;
  allowedHoursEndHourUtc?: unknown;
  maxActionsPerDay?: unknown;
  maxGuardedMetricRegressionPct?: unknown;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<GuardrailPolicyBody>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const body = parsed.body;

  if (
    !Array.isArray(body.protectedTargetIds) ||
    body.protectedTargetIds.some((id) => typeof id !== 'string')
  ) {
    return NextResponse.json({ error: 'invalid_protected_target_ids' }, { status: 400 });
  }
  for (const [fieldName, value] of Object.entries({
    maxDailyBudgetChangePct: body.maxDailyBudgetChangePct,
    spendCeilingUsd: body.spendCeilingUsd,
    maxActionsPerDay: body.maxActionsPerDay,
    maxGuardedMetricRegressionPct: body.maxGuardedMetricRegressionPct,
    allowedHoursStartHourUtc: body.allowedHoursStartHourUtc,
    allowedHoursEndHourUtc: body.allowedHoursEndHourUtc,
  })) {
    if (value !== null && value !== undefined && typeof value !== 'number') {
      return NextResponse.json({ error: `invalid_${fieldName}` }, { status: 400 });
    }
  }

  const startHourUtc = (body.allowedHoursStartHourUtc as number | null | undefined) ?? null;
  const endHourUtc = (body.allowedHoursEndHourUtc as number | null | undefined) ?? null;
  if ((startHourUtc === null) !== (endHourUtc === null)) {
    return NextResponse.json({ error: 'allowed_hours_must_be_set_together' }, { status: 400 });
  }

  try {
    const policy = await setAutomationGuardrailPolicy({
      organizationId: orgId,
      projectId,
      maxDailyBudgetChangePct: (body.maxDailyBudgetChangePct as number | null | undefined) ?? null,
      spendCeilingUsd: (body.spendCeilingUsd as number | null | undefined) ?? null,
      protectedTargetIds: body.protectedTargetIds as string[],
      allowedHours: startHourUtc !== null && endHourUtc !== null ? { startHourUtc, endHourUtc } : null,
      maxActionsPerDay: (body.maxActionsPerDay as number | null | undefined) ?? null,
      maxGuardedMetricRegressionPct: (body.maxGuardedMetricRegressionPct as number | null | undefined) ?? null,
      setByUserId: user.id,
    });
    return NextResponse.json({ id: policy.id, setAt: policy.set_at }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidAutomationActionError) {
      return NextResponse.json({ error: 'invalid_policy' }, { status: 400 });
    }
    throw err;
  }
}
