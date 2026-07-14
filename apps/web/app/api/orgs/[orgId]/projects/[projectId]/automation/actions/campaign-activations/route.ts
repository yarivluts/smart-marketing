import { NextResponse, type NextRequest } from 'next/server';
import { AutomationTargetNotFoundError, InvalidAutomationActionError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { proposeCampaignActivationAction } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Proposes a KAN-72 `campaign_activation` action — flips an already-created, still-paused campaign live. KAN-71's dry-run-diff step. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ targetId?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { targetId } = parsed.body;
  if (typeof targetId !== 'string' || targetId.trim().length === 0) {
    return NextResponse.json({ error: 'target_id_required' }, { status: 400 });
  }

  try {
    const action = await proposeCampaignActivationAction({ organizationId: orgId, projectId, targetId, requestedByUserId: user.id });
    return NextResponse.json({ id: action.id, status: action.status, guardrailViolations: action.guardrail_violations }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof AutomationTargetNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidAutomationActionError) {
      return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
    }
    throw err;
  }
}
