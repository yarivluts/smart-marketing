import { NextResponse, type NextRequest } from 'next/server';
import { AutomationTargetNotFoundError, InvalidAutomationActionError, ProjectNotFoundError, type CampaignDraft } from '@growthos/firebase-orm-models';
import { proposeCampaignDraftCreateAction } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Proposes a KAN-72 `campaign_draft_create` action — a brand-new, always-paused
 * Search campaign (campaign + ad group(s) + RSA ad(s) + keywords/negatives) —
 * KAN-71's dry-run-diff step. Lands as `blocked` or `awaiting_approval`
 * depending on the project's guardrail policy and the target's linked
 * connection's write tier (Manage required). Draft shape validation
 * (RSA headline/description counts, keyword text, etc.) happens inside
 * `proposeCampaignDraftCreateAction` itself.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ targetId?: unknown; draft?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { targetId, draft } = parsed.body;
  if (typeof targetId !== 'string' || targetId.trim().length === 0) {
    return NextResponse.json({ error: 'target_id_required' }, { status: 400 });
  }
  if (typeof draft !== 'object' || draft === null) {
    return NextResponse.json({ error: 'draft_required' }, { status: 400 });
  }

  try {
    const action = await proposeCampaignDraftCreateAction({
      organizationId: orgId,
      projectId,
      targetId,
      draft: draft as CampaignDraft,
      requestedByUserId: user.id,
    });
    return NextResponse.json({ id: action.id, status: action.status, guardrailViolations: action.guardrail_violations }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof AutomationTargetNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidAutomationActionError) {
      return NextResponse.json({ error: 'invalid_campaign_draft', message: err.message }, { status: 400 });
    }
    throw err;
  }
}
