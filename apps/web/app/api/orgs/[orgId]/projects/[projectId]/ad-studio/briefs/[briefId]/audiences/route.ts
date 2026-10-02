import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { loadAdStudioMetaAudiences } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/**
 * The project's Meta ad account audiences (custom, lookalike, saved) with Meta's size ranges, or
 * `{status: 'unavailable', reason}` when there is no usable Meta account. Read only. Gated on `ai.use`.
 */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    return NextResponse.json({ result: await loadAdStudioMetaAudiences({ organizationId: orgId, projectId }) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
