import { NextResponse, type NextRequest } from 'next/server';
import { getAdStudioReference } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { resolveAdStudioMediaStorage } from '@/lib/ad-studio/engine';
import { streamAdStudioMedia } from '@/lib/ad-studio/media-response';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string; referenceId: string }>;
}

export const dynamic = 'force-dynamic';

/**
 * Serves a reference image from the private bucket. Gated on `ai.use`; the object path comes from
 * the image's record, never from the request.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { orgId, projectId, briefId, referenceId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    await ensureFirestoreOrm();
    const reference = await getAdStudioReference(orgId, projectId, briefId, referenceId);
    if (reference.status !== 'ready' || !reference.gcs_path) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return await streamAdStudioMedia(resolveAdStudioMediaStorage(), reference.gcs_path, request.headers.get('range'), reference.mime_type ?? 'image/png');
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
