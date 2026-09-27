import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { listBriefVideo, resolveAdStudioVideoDeps, startSceneEdit } from '@/lib/ad-studio/video-pipeline';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string; sceneId: string }>;
}

/**
 * Starts a conversational edit ("make it night", "slower camera") of the scene's newest finished
 * clip, chained from its Gemini interaction (KAN-231). Metered as `video_edit` by that clip's
 * seconds. Gated on `ai.use`.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId, sceneId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ instruction?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const instruction = typeof parsed.body?.instruction === 'string' ? parsed.body.instruction.slice(0, 500) : '';
  const deps = resolveAdStudioVideoDeps();
  if (!deps.omni) return NextResponse.json({ error: 'provider_failed', code: 'not_configured' }, { status: 503 });
  try {
    await startSceneEdit({ organizationId: orgId, projectId, briefId, sceneId, instruction, actorId: user.id }, { ...deps, omni: deps.omni });
    return NextResponse.json(await listBriefVideo({ organizationId: orgId, projectId, briefId }));
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
