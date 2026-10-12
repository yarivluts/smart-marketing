import { NextResponse, type NextRequest } from 'next/server';
import { AdStudioClipNotChoosableError } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { chooseBriefClip } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string; clipId: string }>;
}

/**
 * Uses this version of its scene in the assembled video, over newer versions the person liked less.
 * Only a ready clip of the scene as it is now counts; a later render of the scene clears the choice.
 * Gated on `ai.use`.
 */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId, clipId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    return NextResponse.json(await chooseBriefClip({ organizationId: orgId, projectId, briefId, clipId }));
  } catch (err) {
    if (err instanceof AdStudioClipNotChoosableError) return NextResponse.json({ error: 'video_request', code: 'not_ready' }, { status: 409 });
    return adStudioErrorResponse(err);
  }
}
