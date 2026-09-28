import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { getAdStudioVideo } from '@/lib/ad-studio/store';
import { resolveAdStudioMediaStorage } from '@/lib/ad-studio/engine';
import { streamAdStudioMedia } from '@/lib/ad-studio/media-response';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string; videoId: string }>;
}

export const dynamic = 'force-dynamic';

/**
 * Streams an assembled ad from the private bucket, with byte ranges (KAN-231). Gated on `ai.use`;
 * the object path comes from the video's record, never from the request.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { orgId, projectId, briefId, videoId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    const video = await getAdStudioVideo(orgId, projectId, briefId, videoId);
    if (video.status !== 'ready' || !video.gcs_path) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return await streamAdStudioMedia(resolveAdStudioMediaStorage(), video.gcs_path, request.headers.get('range'));
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
