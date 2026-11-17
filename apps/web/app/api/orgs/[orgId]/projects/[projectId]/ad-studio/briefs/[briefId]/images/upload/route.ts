import { NextResponse, type NextRequest } from 'next/server';
import { AD_STUDIO_MAX_GALLERY_IMAGE_UPLOAD_BYTES, isAdStudioImageFormat } from '@growthos/shared';
import { requireProjectPermission } from '@/lib/orgs/access';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { useCustomImageForBrief } from '@/lib/ad-studio/engine';
import { briefImagesPayload } from '@/lib/ad-studio/images-payload';
import { readMediaUploadOrSource } from '@/lib/ad-studio/upload-request';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/** Uploads or picks a custom photo/screen for an existing image placement or a new image ad concept. Gated on `ai.use`. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await readMediaUploadOrSource(request, {
    maxFileBytes: AD_STUDIO_MAX_GALLERY_IMAGE_UPLOAD_BYTES,
    allowSource: true,
  });
  if (parsed.error) return parsed.error;
  const { upload, source, alsoSaveToGallery, fields } = parsed.data;
  const format = isAdStudioImageFormat(fields.format) ? fields.format : 'square';
  const conceptId = fields.conceptId?.trim() ? fields.conceptId.trim() : undefined;
  const headline = fields.headline;
  try {
    const { image } = await useCustomImageForBrief({
      organizationId: orgId,
      projectId,
      briefId,
      actorId: user.id,
      conceptId,
      format,
      upload,
      source,
      headline,
      alsoSaveToGallery,
    });
    const payload = await briefImagesPayload(orgId, projectId, briefId);
    return NextResponse.json({ ...payload, image });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
