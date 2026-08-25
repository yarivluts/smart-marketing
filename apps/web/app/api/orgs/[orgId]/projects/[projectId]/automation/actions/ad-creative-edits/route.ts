import { NextResponse, type NextRequest } from 'next/server';
import { AutomationTargetNotFoundError, InvalidAutomationActionError, ProjectNotFoundError, type AdCreativeEditContent } from '@growthos/firebase-orm-models';
import { proposeAdCreativeEditAction } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Proposes a KAN-73 follow-up `ad_creative_edit` action — replaces an
 * already-created Meta ad's creative (primary text/headline/description/
 * link/image) with revised content ("post-creation edits beyond
 * activation", the Meta sibling of `ad-edits`). Lands as `blocked` or
 * `awaiting_approval` depending on the project's guardrail policy and the
 * target's linked connection's write tier (Manage required, same as
 * `campaign_draft_create`/`campaign_activation`/`ad_edit`/`meta_ad_set_edit`).
 * Input shape validation (creative content limits) and the "adResourceName
 * must be one of this target's own ads" check both happen inside
 * `proposeAdCreativeEditAction` itself.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ targetId?: unknown; adResourceName?: unknown; creative?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { targetId, adResourceName, creative } = parsed.body;
  if (typeof targetId !== 'string' || targetId.trim().length === 0) {
    return NextResponse.json({ error: 'target_id_required' }, { status: 400 });
  }
  if (typeof adResourceName !== 'string' || adResourceName.trim().length === 0) {
    return NextResponse.json({ error: 'ad_resource_name_required' }, { status: 400 });
  }

  try {
    const action = await proposeAdCreativeEditAction({
      organizationId: orgId,
      projectId,
      targetId,
      adResourceName,
      creative: creative as AdCreativeEditContent,
      requestedByUserId: user.id,
    });
    return NextResponse.json({ id: action.id, status: action.status, guardrailViolations: action.guardrail_violations }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof AutomationTargetNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidAutomationActionError) {
      return NextResponse.json({ error: 'invalid_ad_creative_edit', message: err.message }, { status: 400 });
    }
    throw err;
  }
}
