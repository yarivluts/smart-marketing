import { NextResponse, type NextRequest } from 'next/server';
import {
  AD_STUDIO_MAX_GALLERY_IMAGE_UPLOAD_BYTES,
  isAdStudioReferenceUse,
  type AdStudioReferenceUse,
} from '@growthos/shared';
import { requireProjectPermission } from '@/lib/orgs/access';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { attachImageToBriefScene } from '@/lib/ad-studio/engine';
import { readMediaUploadOrSource } from '@/lib/ad-studio/upload-request';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string; sceneId: string }>;
}

/** Attaches a computer upload, gallery photo, or scanned product screen to a scene on the brief's script. Gated on `ai.use`. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId, sceneId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await readMediaUploadOrSource(request, {
    maxFileBytes: AD_STUDIO_MAX_GALLERY_IMAGE_UPLOAD_BYTES,
    allowSource: true,
  });
  if (parsed.error) return parsed.error;
  const { upload, source, alsoSaveToGallery, fields } = parsed.data;
  const use: AdStudioReferenceUse = isAdStudioReferenceUse(fields.use) ? fields.use : 'screen';
  try {
    const result = await attachImageToBriefScene({
      organizationId: orgId,
      projectId,
      briefId,
      sceneId,
      actorId: user.id,
      upload,
      source,
      use,
      alsoSaveToGallery,
    });
    return NextResponse.json(result);
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
