import { NextResponse, type NextRequest } from 'next/server';
import { AD_STUDIO_MAX_GALLERY_IMAGE_UPLOAD_BYTES, parseGallerySourceRef } from '@growthos/shared';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { resolveAdStudioVideoDeps, useScrollClipForScene } from '@/lib/ad-studio/engine';
import { readMediaUploadOrSource } from '@/lib/ad-studio/upload-request';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string; sceneId: string }>;
}

/**
 * Replaces a scene's video clip with a smooth vertical scroll video generated from a scanned site
 * page (`{ sitePageId }`), a gallery screenshot (`{ source }`), or an uploaded tall PNG/JPEG/WebP.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId, sceneId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;

  let input: Parameters<typeof useScrollClipForScene>[1];
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const parsed = await readMediaUploadOrSource(request, {
      maxFileBytes: AD_STUDIO_MAX_GALLERY_IMAGE_UPLOAD_BYTES,
      allowSource: false,
    });
    if (parsed.error) return parsed.error;
    const { upload, alsoSaveToGallery } = parsed.data;
    if (!upload) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    input = {
      bytes: upload.bytes,
      fileName: upload.fileName,
      label: upload.label,
      alsoSaveToGallery,
    };
  } else {
    const parsed = await parseJsonBody<Record<string, unknown>>(request);
    if (parsed.error) return parsed.error;
    const body = parsed.body;
    if (typeof body?.sitePageId === 'string' && body.sitePageId.trim().length > 0) {
      input = { sitePageId: body.sitePageId.trim() };
    } else {
      const source = parseGallerySourceRef(body?.source);
      if (!source) {
        return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
      }
      input = { source };
    }
  }

  try {
    const { tts } = resolveAdStudioVideoDeps();
    const result = await useScrollClipForScene(
      {
        organizationId: orgId,
        projectId,
        briefId,
        sceneId,
        actorId: user.id,
      },
      input,
      { tts },
    );
    return NextResponse.json(result);
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
