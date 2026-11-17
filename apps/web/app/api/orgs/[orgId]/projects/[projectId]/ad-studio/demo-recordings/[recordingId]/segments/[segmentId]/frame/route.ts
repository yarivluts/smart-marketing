import { type NextRequest, NextResponse } from 'next/server';
import { getAdStudioDemoRecording } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { resolveAdStudioMediaStorage, resolveGallerySource } from '@/lib/ad-studio/engine';
import { streamAdStudioMedia } from '@/lib/ad-studio/media-response';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; recordingId: string; segmentId: string }>;
}

/** Serves the JPEG preview frame for one AI-scanned product tour segment. Gated on `ai.use`. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { orgId, projectId, recordingId, segmentId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    await ensureFirestoreOrm();
    const recording = await getAdStudioDemoRecording(orgId, projectId, recordingId);
    const segment = recording.segments.find((entry) => entry.id === segmentId);
    if (!segment) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const storage = resolveAdStudioMediaStorage();
    if (segment.frame_gcs_path && (await storage.size(segment.frame_gcs_path)) !== null) {
      return await streamAdStudioMedia(
        storage,
        segment.frame_gcs_path,
        request.headers.get('range'),
        'image/jpeg',
        'private, max-age=3600',
      );
    }
    const resolved = await resolveGallerySource(
      { organizationId: orgId, projectId },
      { type: 'demo_segment', recordingId, segmentId },
      'image',
      { storage },
    );
    return new Response(new Uint8Array(resolved.bytes), {
      status: 200,
      headers: {
        'content-type': 'image/jpeg',
        'cache-control': 'private, max-age=3600',
        'content-disposition': 'inline',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
