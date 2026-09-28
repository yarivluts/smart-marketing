import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { getAdStudioClip } from '@/lib/ad-studio/store';
import { resolveAdStudioMediaStorage } from '@/lib/ad-studio/engine';
import { streamAdStudioMedia } from '@/lib/ad-studio/media-response';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string; clipId: string }>;
}

export const dynamic = 'force-dynamic';

/**
 * Streams one finished scene clip from the private bucket, with byte ranges so the player can seek
 * (KAN-231). The only way a clip leaves the bucket: gated on `ai.use` for the project, and the
 * object path comes from the clip's record, never from the request.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { orgId, projectId, briefId, clipId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    const clip = await getAdStudioClip(orgId, projectId, briefId, clipId);
    if (clip.status !== 'ready' || !clip.gcs_path) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return await streamAdStudioMedia(resolveAdStudioMediaStorage(), clip.gcs_path, request.headers.get('range'));
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
