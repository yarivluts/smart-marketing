import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { generateAdStudioImageConcepts, resolveAdStudioLlm } from '@/lib/ad-studio/engine';
import { parseAutopilotOptions } from '@/lib/ad-studio/parse';
import { briefImagesPayload } from '@/lib/ad-studio/images-payload';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/**
 * Writes image ad ideas for the brief with the text model, building on its plan and video script,
 * and saves them (replacing the list). `imageFormats` narrows the placements. Counts toward the
 * daily AI text limit. Gated on `ai.use`.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ imageFormats?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const llm = resolveAdStudioLlm();
  if (!llm) return NextResponse.json({ error: 'provider_failed', code: 'not_configured' }, { status: 503 });
  try {
    const { imageFormats } = parseAutopilotOptions(parsed.body ?? {});
    await generateAdStudioImageConcepts({ organizationId: orgId, projectId, briefId, actorId: user.id, llm, formats: imageFormats });
    return NextResponse.json(await briefImagesPayload(orgId, projectId, briefId));
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
