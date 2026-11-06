import type { NextRequest } from 'next/server';
import { getAdStudioImage } from '@growthos/firebase-orm-models';
import { isShareableId, resolveShareLink, SHARED_MEDIA_CACHE_CONTROL, shareLinkCoversBrief, sharedMediaError, sharedNotFound } from '@/lib/ad-studio/share';
import { resolveAdStudioMediaStorage } from '@/lib/ad-studio/engine';
import { streamAdStudioMedia } from '@/lib/ad-studio/media-response';

interface RouteParams {
  params: Promise<{ token: string; briefId: string; imageId: string }>;
}

export const dynamic = 'force-dynamic';

/**
 * A shared ad image. The token decides the org and project; the brief must be one the link shows,
 * and only the chosen, ready image of a placement is served - never drafts or alternatives.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { token, briefId, imageId } = await params;
  if (!isShareableId(briefId) || !isShareableId(imageId)) return sharedNotFound();
  const link = await resolveShareLink(token);
  if (!link || !shareLinkCoversBrief(link, briefId)) return sharedNotFound();
  try {
    const image = await getAdStudioImage(link.organizationId, link.projectId, briefId, imageId);
    if (image.status !== 'ready' || !image.selected || !image.gcs_path) return sharedNotFound();
    return await streamAdStudioMedia(resolveAdStudioMediaStorage(), image.gcs_path, request.headers.get('range'), image.mime_type ?? 'image/png', SHARED_MEDIA_CACHE_CONTROL);
  } catch (error) {
    return sharedMediaError(error);
  }
}
