import type { NextRequest } from 'next/server';
import { isShareableId, resolveShareLink, SHARED_MEDIA_CACHE_CONTROL, shareLinkCoversBrief, sharedMediaError, sharedNotFound } from '@/lib/ad-studio/share';
import { getAdStudioVideo } from '@/lib/ad-studio/store';
import { resolveAdStudioMediaStorage } from '@/lib/ad-studio/engine';
import { streamAdStudioMedia } from '@/lib/ad-studio/media-response';

interface RouteParams {
  params: Promise<{ token: string; briefId: string; videoId: string }>;
}

export const dynamic = 'force-dynamic';

/** A shared assembled video, with byte ranges. The token decides the org and project; the brief must be one the link shows. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { token, briefId, videoId } = await params;
  if (!isShareableId(briefId) || !isShareableId(videoId)) return sharedNotFound();
  const link = await resolveShareLink(token);
  if (!link || !shareLinkCoversBrief(link, briefId)) return sharedNotFound();
  try {
    const video = await getAdStudioVideo(link.organizationId, link.projectId, briefId, videoId);
    if (video.status !== 'ready' || !video.gcs_path) return sharedNotFound();
    return await streamAdStudioMedia(resolveAdStudioMediaStorage(), video.gcs_path, request.headers.get('range'), 'video/mp4', SHARED_MEDIA_CACHE_CONTROL);
  } catch (error) {
    return sharedMediaError(error);
  }
}
