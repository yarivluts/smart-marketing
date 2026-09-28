import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { assembleBriefVideo, listBriefVideo, resolveAdStudioVideoDeps, toAdStudioVideoView } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/**
 * Joins the newest ready, current clip of every scene, in script order, into one MP4 of at most
 * 60 seconds with ffmpeg, stores it in the private bucket and records it (KAN-231). Runs within the
 * request. No provider call, so nothing is metered. Gated on `ai.use`.
 */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const { storage, runner } = resolveAdStudioVideoDeps();
  try {
    const video = await assembleBriefVideo({ organizationId: orgId, projectId, briefId, actorId: user.id }, { storage, runner });
    return NextResponse.json({ video: toAdStudioVideoView(video), ...(await listBriefVideo({ organizationId: orgId, projectId, briefId })) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
