import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { removeGalleryAsset, updateProjectGalleryAsset } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; assetId: string }>;
}

/** Renames or updates the description of a project gallery asset. Gated on `ai.use`. */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, assetId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ label?: unknown; description?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const label = typeof parsed.body?.label === 'string' ? parsed.body.label : undefined;
  const description = typeof parsed.body?.description === 'string' ? parsed.body.description : undefined;
  if (label === undefined && description === undefined) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  try {
    const item = await updateProjectGalleryAsset({ organizationId: orgId, projectId, assetId, label, description });
    return NextResponse.json({ item });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}

/** Removes an asset from the project gallery and deletes its stored file. Gated on `ai.use`. */
export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, assetId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    await removeGalleryAsset({ organizationId: orgId, projectId, assetId });
    return NextResponse.json({ deleted: assetId });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
