import { NextResponse, type NextRequest } from 'next/server';
import { getAdStudioImage } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { resolveAdStudioMediaStorage } from '@/lib/ad-studio/engine';
import { streamAdStudioMedia } from '@/lib/ad-studio/media-response';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string; imageId: string }>;
}

export const dynamic = 'force-dynamic';

/**
 * Serves a generated ad image from the private bucket. Gated on `ai.use`; the object path comes from
 * the image's record, never from the request.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { orgId, projectId, briefId, imageId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    await ensureFirestoreOrm();
    const image = await getAdStudioImage(orgId, projectId, briefId, imageId);
    if (image.status !== 'ready' || !image.gcs_path) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return await streamAdStudioMedia(resolveAdStudioMediaStorage(), image.gcs_path, request.headers.get('range'), image.mime_type ?? 'image/png');
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
