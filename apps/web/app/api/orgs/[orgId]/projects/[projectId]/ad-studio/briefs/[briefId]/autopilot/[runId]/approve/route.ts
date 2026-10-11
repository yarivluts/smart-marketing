import { NextResponse, type NextRequest } from 'next/server';
import { AdStudioRunNotAwaitingApprovalError, approveAdStudioRunPlan } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { toAdStudioRunView } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string; runId: string }>;
}

/**
 * Confirms the plan of an autopilot run - the plan, script and image ideas as they read now,
 * including the person's edits - so it goes on to render images and video. Audited. Gated on `ai.use`.
 */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId, runId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    await ensureFirestoreOrm();
    const run = await approveAdStudioRunPlan({ organizationId: orgId, projectId, briefId, runId, actorId: user.id });
    return NextResponse.json({ run: toAdStudioRunView(run) });
  } catch (err) {
    if (err instanceof AdStudioRunNotAwaitingApprovalError) return NextResponse.json({ error: 'not_awaiting_approval' }, { status: 409 });
    return adStudioErrorResponse(err);
  }
}
