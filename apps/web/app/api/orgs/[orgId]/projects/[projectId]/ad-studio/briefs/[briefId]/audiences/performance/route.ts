import { NextResponse, type NextRequest } from 'next/server';
import { META_BREAKDOWNS, type MetaBreakdown } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { loadAdStudioMetaPerformance } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/**
 * The Meta ad account's last 90 days by `?breakdown=` age_gender (default), placement or country:
 * spend, impressions, clicks, link clicks and conversions per segment. Read only. Gated on `ai.use`.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const raw = request.nextUrl.searchParams.get('breakdown') ?? 'age_gender';
  if (!(raw in META_BREAKDOWNS)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    return NextResponse.json({ result: await loadAdStudioMetaPerformance({ organizationId: orgId, projectId, breakdown: raw as MetaBreakdown }) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
