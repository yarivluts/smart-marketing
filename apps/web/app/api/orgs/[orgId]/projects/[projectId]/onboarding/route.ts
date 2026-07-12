import { NextResponse, type NextRequest } from 'next/server';
import { ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { getOnboardingState } from '@/lib/orgs/queries';
import { startOnboarding } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { toOnboardingStateView } from '@/lib/orgs/onboarding-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** The project's onboarding-wizard state (KAN-68), or `null` if the wizard has never been opened. Gated on `project.manage`, the same per-project admin-config permission the wizard's every underlying action (plugin install, key mint, board seeding) is already reachable through for a `project_admin`. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'project.manage');
  if (error) {
    return error;
  }

  try {
    const state = await getOnboardingState(orgId, projectId);
    return NextResponse.json({ state: state ? toOnboardingStateView(state) : null });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}

/** Starts (or resumes — idempotent) the onboarding wizard for a project. */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'project.manage');
  if (error) {
    return error;
  }

  try {
    const state = await startOnboarding(orgId, projectId, user.id);
    return NextResponse.json({ state: toOnboardingStateView(state) }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
