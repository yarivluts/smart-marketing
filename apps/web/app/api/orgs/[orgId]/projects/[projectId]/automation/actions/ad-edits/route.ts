import { NextResponse, type NextRequest } from 'next/server';
import { AutomationTargetNotFoundError, InvalidAutomationActionError, ProjectNotFoundError, type AdEditResponsiveSearchAdContent } from '@growthos/firebase-orm-models';
import { proposeAdEditAction } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Proposes a KAN-72 follow-up `ad_edit` action — replaces an already-created
 * ad group's Responsive Search Ad with revised headlines/descriptions/final
 * URL ("post-creation ad edits"). Lands as `blocked` or `awaiting_approval`
 * depending on the project's guardrail policy and the target's linked
 * connection's write tier (Manage required, same as
 * `campaign_draft_create`/`campaign_activation`/`keyword_edit`). Input shape
 * validation (RSA headline/description limits, final URL) and the
 * "previousAdResourceName must be one of this target's own ads" check both
 * happen inside `proposeAdEditAction` itself.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ targetId?: unknown; previousAdResourceName?: unknown; responsiveSearchAd?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { targetId, previousAdResourceName, responsiveSearchAd } = parsed.body;
  if (typeof targetId !== 'string' || targetId.trim().length === 0) {
    return NextResponse.json({ error: 'target_id_required' }, { status: 400 });
  }
  if (typeof previousAdResourceName !== 'string' || previousAdResourceName.trim().length === 0) {
    return NextResponse.json({ error: 'previous_ad_resource_name_required' }, { status: 400 });
  }

  try {
    const action = await proposeAdEditAction({
      organizationId: orgId,
      projectId,
      targetId,
      previousAdResourceName,
      responsiveSearchAd: responsiveSearchAd as AdEditResponsiveSearchAdContent,
      requestedByUserId: user.id,
    });
    return NextResponse.json({ id: action.id, status: action.status, guardrailViolations: action.guardrail_violations }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof AutomationTargetNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidAutomationActionError) {
      return NextResponse.json({ error: 'invalid_ad_edit', message: err.message }, { status: 400 });
    }
    throw err;
  }
}
