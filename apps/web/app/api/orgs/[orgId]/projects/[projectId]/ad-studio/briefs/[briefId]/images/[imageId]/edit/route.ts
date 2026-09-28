import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { editAdStudioImage, resolveAdStudioImageDeps } from '@/lib/ad-studio/engine';
import { briefImagesPayload } from '@/lib/ad-studio/images-payload';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string; imageId: string }>;
}

/**
 * Changes a ready image by an instruction ("warmer light", "put the headline at the top"): the image
 * model receives the image and the instruction, and the result is a new version of the same idea and
 * placement. Counts toward the daily image limit. Gated on `ai.use`.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId, imageId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ instruction?: unknown }>(request);
  if (parsed.error) return parsed.error;
  if (typeof parsed.body?.instruction !== 'string') return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const deps = resolveAdStudioImageDeps();
  if (!deps.images) return NextResponse.json({ error: 'provider_failed', code: 'not_configured' }, { status: 503 });
  try {
    await editAdStudioImage({ organizationId: orgId, projectId, briefId, actorId: user.id, imageId, instruction: parsed.body.instruction }, deps);
  } catch (err) {
    const response = adStudioErrorResponse(err);
    if (response.status !== 502) return response;
  }
  return NextResponse.json(await briefImagesPayload(orgId, projectId, briefId));
}
