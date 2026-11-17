import { NextResponse, type NextRequest } from 'next/server';
import { AD_STUDIO_MAX_GALLERY_VIDEO_BYTES } from '@growthos/shared';
import { requireProjectPermission } from '@/lib/orgs/access';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { listBriefVideo, useCustomClipForScene } from '@/lib/ad-studio/engine';
import { readMediaUploadOrSource } from '@/lib/ad-studio/upload-request';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string; sceneId: string }>;
}

/** Replaces a scene's video clip with a computer upload, gallery video, or scanned walkthrough moment. Gated on `ai.use`. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId, sceneId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await readMediaUploadOrSource(request, { maxFileBytes: AD_STUDIO_MAX_GALLERY_VIDEO_BYTES, allowSource: true });
  if (parsed.error) return parsed.error;
  const { upload, source, alsoSaveToGallery } = parsed.data;
  try {
    await useCustomClipForScene({
      organizationId: orgId,
      projectId,
      briefId,
      sceneId,
      actorId: user.id,
      upload,
      source,
      alsoSaveToGallery,
    });
    return NextResponse.json(await listBriefVideo({ organizationId: orgId, projectId, briefId }));
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
