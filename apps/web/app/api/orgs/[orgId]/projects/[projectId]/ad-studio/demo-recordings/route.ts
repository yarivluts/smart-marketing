import { NextResponse, type NextRequest } from 'next/server';
import { listAdStudioDemoRecordings, toAdStudioDemoRecordingView } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { recordProductWalkthrough, resolveAdStudioDemoDeps } from '@/lib/ad-studio/engine';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

export const dynamic = 'force-dynamic';

/** The project's product walkthroughs, newest first. Gated on `ai.use`. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  await ensureFirestoreOrm();
  return NextResponse.json({ recordings: (await listAdStudioDemoRecordings(orgId, projectId)).map(toAdStudioDemoRecordingView) });
}

/**
 * Records a walkthrough of the product with the stored trial access - inside the request, about a
 * minute or two (Cloud Run allows ten). Refused when no trial access is set or one is already
 * recording. A recording that fails is returned with its code. AI guide calls are metered as
 * `demo_tour`. Gated on `ai.use`.
 */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    const recording = await recordProductWalkthrough({ organizationId: orgId, projectId, actorId: user.id }, resolveAdStudioDemoDeps());
    return NextResponse.json({ recording: toAdStudioDemoRecordingView(recording) }, { status: recording.status === 'ready' ? 201 : 200 });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
