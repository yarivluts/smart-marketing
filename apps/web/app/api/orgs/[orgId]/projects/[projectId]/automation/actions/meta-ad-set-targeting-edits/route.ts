import { NextResponse, type NextRequest } from 'next/server';
import { AutomationTargetNotFoundError, InvalidAutomationActionError, ProjectNotFoundError, type MetaAdSetTargetingEdit } from '@growthos/firebase-orm-models';
import { proposeMetaAdSetTargetingEditAction } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Proposes a KAN-73 follow-up `meta_ad_set_targeting_edit` action — replaces
 * the whole targeting spec (countries/age range/genders) of a Meta ad set an
 * earlier `campaign_draft_create` action already created ("ad-set
 * targeting-spec edits", the Meta sibling of `meta-ad-set-edits`, for
 * targeting instead of budget/status). Lands as `blocked` or
 * `awaiting_approval` depending on the project's guardrail policy and the
 * target's linked connection's write tier (Manage required, same as
 * `campaign_draft_create`/`campaign_activation`/`meta_ad_set_edit`). Input
 * shape validation (age range, ISO country codes, gender values) and the
 * "adSetResourceName must be one of this target's own ad sets" check both
 * happen inside `proposeMetaAdSetTargetingEditAction` itself — this route
 * only checks that `targeting` is present as an object before handing it
 * through, since a malformed `targeting` shape (a string, an array, `null`)
 * would otherwise reach the service as an untyped cast.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ targetId?: unknown; adSetResourceName?: unknown; targeting?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { targetId, adSetResourceName, targeting } = parsed.body;
  if (typeof targetId !== 'string' || targetId.trim().length === 0) {
    return NextResponse.json({ error: 'target_id_required' }, { status: 400 });
  }
  if (typeof adSetResourceName !== 'string' || adSetResourceName.trim().length === 0) {
    return NextResponse.json({ error: 'ad_set_resource_name_required' }, { status: 400 });
  }
  if (typeof targeting !== 'object' || targeting === null || Array.isArray(targeting)) {
    return NextResponse.json({ error: 'targeting_required' }, { status: 400 });
  }

  try {
    const action = await proposeMetaAdSetTargetingEditAction({
      organizationId: orgId,
      projectId,
      targetId,
      adSetResourceName,
      targeting: targeting as MetaAdSetTargetingEdit,
      requestedByUserId: user.id,
    });
    return NextResponse.json({ id: action.id, status: action.status, guardrailViolations: action.guardrail_violations }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof AutomationTargetNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidAutomationActionError) {
      return NextResponse.json({ error: 'invalid_meta_ad_set_targeting_edit', message: err.message }, { status: 400 });
    }
    throw err;
  }
}
