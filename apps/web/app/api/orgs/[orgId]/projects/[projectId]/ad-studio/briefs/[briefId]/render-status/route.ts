import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { advanceBriefVideo, resolveAdStudioVideoDeps } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

export const dynamic = 'force-dynamic';

/**
 * The page's status poll (KAN-231): moves every generating clip of the brief one step - the Gemini
 * interaction finished, its file ready, the file copied into the private bucket - and returns all
 * clips and assembled videos. Safe to call concurrently (per-clip lease). Gated on `ai.use`.
 */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const deps = resolveAdStudioVideoDeps();
  const ctx = { organizationId: orgId, projectId, briefId };
  try {
    // Without a video model nothing advances, but work that died is still given up on.
    const result = await advanceBriefVideo(ctx, deps);
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
