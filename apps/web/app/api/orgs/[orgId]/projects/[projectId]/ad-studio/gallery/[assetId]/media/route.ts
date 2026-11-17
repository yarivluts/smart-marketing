import { type NextRequest } from 'next/server';
import { getAdStudioGalleryAsset } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { resolveAdStudioMediaStorage } from '@/lib/ad-studio/engine';
import { streamAdStudioMedia } from '@/lib/ad-studio/media-response';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; assetId: string }>;
}

/** Streams a project gallery image or video with HTTP byte-range support. Gated on `ai.use`. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { orgId, projectId, assetId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    await ensureFirestoreOrm();
    const asset = await getAdStudioGalleryAsset(orgId, projectId, assetId);
    return await streamAdStudioMedia(
      resolveAdStudioMediaStorage(),
      asset.gcs_path,
      request.headers.get('range'),
      asset.mime_type,
      'private, max-age=3600',
    );
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
