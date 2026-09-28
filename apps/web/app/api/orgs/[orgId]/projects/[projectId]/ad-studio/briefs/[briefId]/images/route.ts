import { NextResponse, type NextRequest } from 'next/server';
import { isAdStudioImageFormat } from '@growthos/shared';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { renderAdStudioConceptImage, resolveAdStudioImageDeps } from '@/lib/ad-studio/engine';
import { briefImagesPayload } from '@/lib/ad-studio/images-payload';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/** The brief's image ideas and every image version. Gated on `ai.use`. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    return NextResponse.json(await briefImagesPayload(orgId, projectId, briefId));
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}

/**
 * Renders one image idea in one placement with Gemini's image model - a new version that becomes the
 * selected one when it succeeds. Counts toward the daily image limit, checked before the call. Gated
 * on `ai.use`.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ conceptId?: unknown; format?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const conceptId = parsed.body?.conceptId;
  const format = parsed.body?.format;
  if (typeof conceptId !== 'string' || !isAdStudioImageFormat(format)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const deps = resolveAdStudioImageDeps();
  if (!deps.images) return NextResponse.json({ error: 'provider_failed', code: 'not_configured' }, { status: 503 });
  try {
    await renderAdStudioConceptImage({ organizationId: orgId, projectId, briefId, actorId: user.id, conceptId, format }, deps);
  } catch (err) {
    // A failed render is recorded on the image itself; the page shows it from the payload.
    const response = adStudioErrorResponse(err);
    if (response.status !== 502) return response;
  }
  return NextResponse.json(await briefImagesPayload(orgId, projectId, briefId));
}
