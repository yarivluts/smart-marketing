import { NextResponse, type NextRequest } from 'next/server';
import { InvalidCampaignTargetError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { deleteCampaignTargetBudget, setCampaignTargetBudget } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; campaignId: string }>;
}

/**
 * Sets (or overwrites) a campaign's spend budget target (KAN-86) — the
 * inline-edit commit path `CampaignTargetInput` PATCHes on blur. Gated on
 * `dashboards.write`, the same permission the Goals/Segments admin routes
 * use for a project-scoped editable-target surface.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, campaignId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const monthlyBudget = (body as { monthlyBudget?: unknown } | null)?.monthlyBudget;
  if (typeof monthlyBudget !== 'number' || !Number.isFinite(monthlyBudget)) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    const target = await setCampaignTargetBudget(orgId, projectId, decodeURIComponent(campaignId), monthlyBudget, user.id);
    return NextResponse.json({ campaignId: target.campaign_id, monthlyBudget: target.monthly_budget });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidCampaignTargetError) {
      return NextResponse.json({ error: 'invalid_target', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}

/** Clears a campaign's spend target (KAN-86) — reverts to "no target" rather than a zero budget. */
export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, campaignId } = await params;
  const { error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  try {
    await deleteCampaignTargetBudget(orgId, projectId, decodeURIComponent(campaignId));
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
