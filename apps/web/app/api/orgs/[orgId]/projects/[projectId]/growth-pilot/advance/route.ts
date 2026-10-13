import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { advanceCurrentGrowthPilot, resolveAdStudioLlm } from '@/lib/ad-studio/engine';
import { loadGrowthPilotPage } from '@/lib/growth-pilot/store';
import { growthPilotErrorResponse } from '@/lib/growth-pilot/http';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

// Reading up to six pages and one analysis call: well under two minutes.
export const maxDuration = 120;

/**
 * Does the pilot's pending work - while the site is being analyzed, reads it and proposes targets -
 * and returns the page data. Safe to call repeatedly and from several tabs: a lease makes the others
 * wait. Counts one call toward the daily AI text limit when it analyzes. Gated on `ai.use`.
 */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const llm = resolveAdStudioLlm();
  if (!llm) return NextResponse.json({ error: 'provider_failed', code: 'not_configured' }, { status: 503 });
  try {
    await advanceCurrentGrowthPilot({ organizationId: orgId, projectId, actorId: user.id, llm });
    return NextResponse.json((await loadGrowthPilotPage(orgId, projectId)) ?? { pilot: null });
  } catch (err) {
    return growthPilotErrorResponse(err);
  }
}
