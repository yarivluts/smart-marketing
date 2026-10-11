import { NextResponse, type NextRequest } from 'next/server';
import { cancelAdStudioRun } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { toAdStudioRunView } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string; runId: string }>;
}

/** Stops an autopilot run: the unit in flight finishes, nothing further starts. Gated on `ai.use`. */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId, runId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    await ensureFirestoreOrm();
    const run = await cancelAdStudioRun({ organizationId: orgId, projectId, briefId, runId, actorId: user.id });
    return NextResponse.json({ run: toAdStudioRunView(run) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
