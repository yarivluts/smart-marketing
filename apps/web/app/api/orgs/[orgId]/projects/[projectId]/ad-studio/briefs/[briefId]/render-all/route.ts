import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { listBriefVideo, resolveAdStudioVideoDeps, startRenderAll } from '@/lib/ad-studio/video-pipeline';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/**
 * Renders every scene without a current clip (KAN-231). The whole batch is checked against the
 * daily video-seconds limit first, so it starts or is refused as one. Gated on `ai.use`.
 */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const deps = resolveAdStudioVideoDeps();
  if (!deps.omni) return NextResponse.json({ error: 'provider_failed', code: 'not_configured' }, { status: 503 });
  try {
    const started = await startRenderAll({ organizationId: orgId, projectId, briefId, actorId: user.id }, { ...deps, omni: deps.omni });
    return NextResponse.json({ started: started.length, ...(await listBriefVideo({ organizationId: orgId, projectId, briefId })) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
