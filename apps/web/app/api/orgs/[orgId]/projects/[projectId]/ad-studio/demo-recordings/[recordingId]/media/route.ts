import { NextResponse, type NextRequest } from 'next/server';
import { getAdStudioDemoRecording } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { resolveAdStudioMediaStorage } from '@/lib/ad-studio/engine';
import { streamAdStudioMedia } from '@/lib/ad-studio/media-response';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; recordingId: string }>;
}

export const dynamic = 'force-dynamic';

/**
 * Streams a recorded walkthrough from the private bucket, with byte ranges. Gated on `ai.use`; the
 * object path comes from the recording's record, never from the request.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { orgId, projectId, recordingId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    await ensureFirestoreOrm();
    const recording = await getAdStudioDemoRecording(orgId, projectId, recordingId);
    if (recording.status !== 'ready' || !recording.gcs_path) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return await streamAdStudioMedia(resolveAdStudioMediaStorage(), recording.gcs_path, request.headers.get('range'));
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
