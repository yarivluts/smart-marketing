import { NextResponse, type NextRequest } from 'next/server';
import { AutomationTargetNotFoundError, InvalidAutomationActionError, ProjectNotFoundError, type CampaignDraftKeyword } from '@growthos/firebase-orm-models';
import { proposeKeywordEditAction } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Proposes a KAN-72 follow-up `keyword_edit` action — adds keywords/negative
 * keywords to an ad group an earlier `campaign_draft_create` action already
 * created ("post-creation keyword edits"). Lands as `blocked` or
 * `awaiting_approval` depending on the project's guardrail policy and the
 * target's linked connection's write tier (Manage required, same as
 * `campaign_draft_create`/`campaign_activation`). Input shape validation
 * (keyword text/match type, at least one of addKeywords/addNegativeKeywords
 * non-empty) and the "adGroupResourceName must be one of this target's own
 * ad groups" check both happen inside `proposeKeywordEditAction` itself.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ targetId?: unknown; adGroupResourceName?: unknown; addKeywords?: unknown; addNegativeKeywords?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { targetId, adGroupResourceName, addKeywords, addNegativeKeywords } = parsed.body;
  if (typeof targetId !== 'string' || targetId.trim().length === 0) {
    return NextResponse.json({ error: 'target_id_required' }, { status: 400 });
  }
  if (typeof adGroupResourceName !== 'string' || adGroupResourceName.trim().length === 0) {
    return NextResponse.json({ error: 'ad_group_resource_name_required' }, { status: 400 });
  }

  try {
    const action = await proposeKeywordEditAction({
      organizationId: orgId,
      projectId,
      targetId,
      adGroupResourceName,
      addKeywords: (Array.isArray(addKeywords) ? addKeywords : []) as CampaignDraftKeyword[],
      addNegativeKeywords: (Array.isArray(addNegativeKeywords) ? addNegativeKeywords : []) as CampaignDraftKeyword[],
      requestedByUserId: user.id,
    });
    return NextResponse.json({ id: action.id, status: action.status, guardrailViolations: action.guardrail_violations }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof AutomationTargetNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidAutomationActionError) {
      return NextResponse.json({ error: 'invalid_keyword_edit', message: err.message }, { status: 400 });
    }
    throw err;
  }
}
