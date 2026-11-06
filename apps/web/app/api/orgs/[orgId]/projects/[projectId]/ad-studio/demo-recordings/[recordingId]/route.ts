import { NextResponse, type NextRequest } from 'next/server';
import { selectAdStudioDemoSegments, toAdStudioDemoRecordingView } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; recordingId: string }>;
}

/** Sets which moments of a walkthrough video ads use (`selectedSegmentIds`, exactly). Gated on `ai.use`. */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, recordingId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ selectedSegmentIds?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const ids = parsed.body?.selectedSegmentIds;
  if (!Array.isArray(ids) || ids.length > 50 || !ids.every((id) => typeof id === 'string')) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    await ensureFirestoreOrm();
    const recording = await selectAdStudioDemoSegments({ organizationId: orgId, projectId, recordingId, segmentIds: ids as string[] });
    return NextResponse.json({ recording: toAdStudioDemoRecordingView(recording) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
