import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { listBriefVideo, resolveAdStudioVideoDeps, startSceneRender } from '@/lib/ad-studio/video-pipeline';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string; sceneId: string }>;
}

/**
 * Starts generating one scene's clip with Gemini Omni from the saved script (KAN-231). Metered
 * against the daily video-seconds limit (kind `video_scene`, units = the scene's seconds) before
 * the model is called. Returns the brief's clips and videos. Gated on `ai.use`.
 */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId, sceneId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const deps = resolveAdStudioVideoDeps();
  if (!deps.omni) return NextResponse.json({ error: 'provider_failed', code: 'not_configured' }, { status: 503 });
  try {
    await startSceneRender({ organizationId: orgId, projectId, briefId, sceneId, actorId: user.id }, { ...deps, omni: deps.omni });
    return NextResponse.json(await listBriefVideo({ organizationId: orgId, projectId, briefId }));
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
