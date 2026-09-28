import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { selectBriefImage } from '@/lib/ad-studio/engine';
import { briefImagesPayload } from '@/lib/ad-studio/images-payload';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string; imageId: string }>;
}

/** Makes a ready image the chosen version for its idea and placement. Gated on `ai.use`. */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId, imageId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    await selectBriefImage({ organizationId: orgId, projectId, briefId, imageId });
    return NextResponse.json(await briefImagesPayload(orgId, projectId, briefId));
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
