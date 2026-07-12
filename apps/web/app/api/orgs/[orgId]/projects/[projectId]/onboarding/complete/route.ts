import { NextResponse, type NextRequest } from 'next/server';
import { ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { completeOnboarding } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { toOnboardingStateView } from '@/lib/orgs/onboarding-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** The wizard's final "invite team + set a goal + turn on the war room" step (plan `10 §2.6` step 5) — marks the wizard done and stamps `completed_at`. Every underlying action (invite, goal, TV pairing) happens through its own existing route; this only records completion. */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'project.manage');
  if (error) {
    return error;
  }

  try {
    const state = await completeOnboarding(orgId, projectId, user.id);
    return NextResponse.json({ state: toOnboardingStateView(state) });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
