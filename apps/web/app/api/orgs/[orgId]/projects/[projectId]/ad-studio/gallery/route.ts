import { NextResponse, type NextRequest } from 'next/server';
import { AD_STUDIO_MAX_GALLERY_VIDEO_BYTES } from '@growthos/shared';
import { requireProjectPermission } from '@/lib/orgs/access';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { addUploadedGalleryAsset, listAllProjectMediaSources, toAdStudioGalleryItemView } from '@/lib/ad-studio/engine';
import { readMediaUploadOrSource } from '@/lib/ad-studio/upload-request';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Lists project gallery uploads, AI walkthrough segments, and optional brief assets. Gated on `ai.use`. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const briefId = request.nextUrl.searchParams.get('briefId') ?? undefined;
  try {
    const items = await listAllProjectMediaSources({ organizationId: orgId, projectId, briefId });
    return NextResponse.json({ items });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}

/** Uploads an image or video clip from the user's computer to the reusable project gallery. Gated on `ai.use`. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await readMediaUploadOrSource(request, { maxFileBytes: AD_STUDIO_MAX_GALLERY_VIDEO_BYTES, allowSource: false });
  if (parsed.error) return parsed.error;
  const { upload } = parsed.data;
  if (!upload) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    const asset = await addUploadedGalleryAsset(
      { organizationId: orgId, projectId, actorId: user.id },
      { bytes: upload.bytes, fileName: upload.fileName, label: upload.label, description: upload.description },
    );
    return NextResponse.json({ item: toAdStudioGalleryItemView(orgId, projectId, asset) }, { status: 201 });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
