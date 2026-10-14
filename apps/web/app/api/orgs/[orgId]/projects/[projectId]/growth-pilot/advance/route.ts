import { NextResponse, type NextRequest } from 'next/server';
import { publicWebOrigin } from '@/lib/integrations/meta';
import { requireProjectPermission } from '@/lib/orgs/access';
import { advanceCurrentGrowthPilot, resolveAdStudioAutopilotDeps, resolveAdStudioImageDeps, resolveAdStudioLlm, resolveAdStudioVideoDeps } from '@/lib/ad-studio/engine';
import { loadGrowthPilotPage } from '@/lib/growth-pilot/store';
import { growthPilotErrorResponse } from '@/lib/growth-pilot/http';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

// One unit of work: reading the site and analyzing it, or one step of a target's ads (an image takes seconds to a minute).
export const maxDuration = 300;

/**
 * Does one unit of the pilot's pending work - while the site is being analyzed, reads it and proposes
 * targets; once targets are approved, opens their Ad Studio briefs and advances their ads one step -
 * and returns the page data. Safe to call repeatedly and from several tabs: a lease makes the others
 * wait. Counts one call toward the daily AI text limit when it analyzes. Gated on `ai.use`.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const llm = resolveAdStudioLlm();
  if (!llm) return NextResponse.json({ error: 'provider_failed', code: 'not_configured' }, { status: 503 });
  try {
    const autopilot = resolveAdStudioAutopilotDeps(resolveAdStudioVideoDeps(), resolveAdStudioImageDeps());
    await advanceCurrentGrowthPilot({ organizationId: orgId, projectId, actorId: user.id, llm, autopilot, publicWebUrl: publicWebOrigin(request.url) });
    return NextResponse.json((await loadGrowthPilotPage(orgId, projectId)) ?? { pilot: null });
  } catch (err) {
    return growthPilotErrorResponse(err);
  }
}
