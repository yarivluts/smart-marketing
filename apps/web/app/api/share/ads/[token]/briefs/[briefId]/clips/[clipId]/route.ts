import type { NextRequest } from 'next/server';
import { getAdStudioClip, listAdStudioClips } from '@growthos/firebase-orm-models';
import {
  isShareableId,
  resolveShareLink,
  SHARED_MEDIA_CACHE_CONTROL,
  shareLinkCoversBrief,
  sharedMediaError,
  sharedNotFound,
} from '@/lib/ad-studio/share';
import { resolveAdStudioMediaStorage } from '@/lib/ad-studio/engine';
import { streamAdStudioMedia } from '@/lib/ad-studio/media-response';

interface RouteParams {
  params: Promise<{ token: string; briefId: string; clipId: string }>;
}

export const dynamic = 'force-dynamic';

/**
 * A shared pre-publication scene clip, with byte ranges. Only links created with `includeDrafts`
 * expose unfinished/pre-assembled scene clips, and only the active ready clip (chosen or newest)
 * of a scene is served — discarded older takes stay hidden.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { token, briefId, clipId } = await params;
  if (!isShareableId(briefId) || !isShareableId(clipId)) return sharedNotFound();
  const link = await resolveShareLink(token);
  if (!link || !link.includeDrafts || !shareLinkCoversBrief(link, briefId)) return sharedNotFound();
  try {
    const [clip, siblingClips] = await Promise.all([
      getAdStudioClip(link.organizationId, link.projectId, briefId, clipId),
      listAdStudioClips(link.organizationId, link.projectId, briefId),
    ]);
    if (clip.status !== 'ready' || !clip.gcs_path) return sharedNotFound();
    const readyForScene = siblingClips.filter((entry) => entry.scene_id === clip.scene_id && entry.status === 'ready');
    const preferred =
      readyForScene.find((entry) => entry.chosen) ??
      [...readyForScene].sort((a, b) => b.version - a.version)[0];
    if (!preferred || preferred.id !== clip.id) return sharedNotFound();
    return await streamAdStudioMedia(
      resolveAdStudioMediaStorage(),
      clip.gcs_path,
      request.headers.get('range'),
      'video/mp4',
      SHARED_MEDIA_CACHE_CONTROL,
    );
  } catch (error) {
    return sharedMediaError(error);
  }
}
