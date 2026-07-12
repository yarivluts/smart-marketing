import { NextResponse, type NextRequest } from 'next/server';
import { ProjectNotFoundError, type OnboardingFunnelStep } from '@growthos/firebase-orm-models';
import { isFunnelStageKey } from '@growthos/shared';
import { confirmOnboardingFunnelSteps } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { toOnboardingStateView } from '@/lib/orgs/onboarding-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

function parseSteps(value: unknown): OnboardingFunnelStep[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const steps: OnboardingFunnelStep[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'object' || entry === null) {
      return null;
    }
    const { eventSchemaName, stageKey } = entry as Record<string, unknown>;
    if (typeof eventSchemaName !== 'string' || eventSchemaName.trim().length === 0) {
      return null;
    }
    if (typeof stageKey !== 'string' || !isFunnelStageKey(stageKey)) {
      return null;
    }
    steps.push({ eventSchemaName, stageKey, order: index });
  }
  return steps;
}

/** The wizard's "confirm the AI-proposed funnel mapping" step (KAN-68 AC: "user confirms"). The proposal itself (`proposeOnboardingFunnelSteps`) is read fresh server-side by the onboarding page on every render — no GET route needed here, only this confirm action. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'project.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ steps?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }

  const steps = parseSteps(parsed.body.steps);
  if (!steps) {
    return NextResponse.json({ error: 'invalid_steps' }, { status: 400 });
  }

  try {
    const state = await confirmOnboardingFunnelSteps({ organizationId: orgId, projectId, userId: user.id, steps });
    return NextResponse.json({ state: toOnboardingStateView(state) });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
