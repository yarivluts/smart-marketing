import { NextResponse, type NextRequest } from 'next/server';
import { AutomationTargetNotFoundError, InvalidAutomationActionError, ProjectNotFoundError, type MetaAdSetStatus } from '@growthos/firebase-orm-models';
import { proposeMetaAdSetEditAction } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Proposes a KAN-73 follow-up `meta_ad_set_edit` action — edits the daily
 * budget and/or status of a Meta ad set an earlier `campaign_draft_create`
 * action already created ("post-creation ad-set edits", the Meta sibling of
 * `keyword-edits`). Lands as `blocked` or `awaiting_approval` depending on the
 * project's guardrail policy and the target's linked connection's write tier
 * (Manage required, same as `campaign_draft_create`/`campaign_activation`/
 * `keyword_edit`). Input shape validation (at least one of
 * dailyBudgetUsd/status set, budget a positive number, status a real value)
 * and the "adSetResourceName must be one of this target's own ad sets" check
 * both happen inside `proposeMetaAdSetEditAction` itself.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ targetId?: unknown; adSetResourceName?: unknown; dailyBudgetUsd?: unknown; status?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { targetId, adSetResourceName, dailyBudgetUsd, status } = parsed.body;
  if (typeof targetId !== 'string' || targetId.trim().length === 0) {
    return NextResponse.json({ error: 'target_id_required' }, { status: 400 });
  }
  if (typeof adSetResourceName !== 'string' || adSetResourceName.trim().length === 0) {
    return NextResponse.json({ error: 'ad_set_resource_name_required' }, { status: 400 });
  }

  try {
    const action = await proposeMetaAdSetEditAction({
      organizationId: orgId,
      projectId,
      targetId,
      adSetResourceName,
      ...(typeof dailyBudgetUsd === 'number' ? { dailyBudgetUsd } : {}),
      ...(typeof status === 'string' ? { status: status as MetaAdSetStatus } : {}),
      requestedByUserId: user.id,
    });
    return NextResponse.json({ id: action.id, status: action.status, guardrailViolations: action.guardrail_violations }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof AutomationTargetNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidAutomationActionError) {
      return NextResponse.json({ error: 'invalid_meta_ad_set_edit', message: err.message }, { status: 400 });
    }
    throw err;
  }
}
