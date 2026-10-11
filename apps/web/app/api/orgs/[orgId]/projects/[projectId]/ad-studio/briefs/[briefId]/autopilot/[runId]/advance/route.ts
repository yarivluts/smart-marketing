import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { advanceAdStudioAutopilot, resolveAdStudioAutopilotDeps, resolveAdStudioImageDeps, resolveAdStudioVideoDeps, toAdStudioRunView } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string; runId: string }>;
}

// One unit of work can be an image (seconds) or the assembly of a 60-second video (up to minutes).
export const maxDuration = 300;

/**
 * Advances an autopilot run by one unit of work - a plan, a script, one image, one check of the
 * clips, the assembly - and returns the run. Safe to call repeatedly and from several tabs: a lease
 * makes the others wait. Gated on `ai.use`.
 */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId, runId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    const deps = resolveAdStudioAutopilotDeps(resolveAdStudioVideoDeps(), resolveAdStudioImageDeps());
    const run = await advanceAdStudioAutopilot({ organizationId: orgId, projectId, briefId, runId, actorId: user.id }, deps);
    return NextResponse.json({ run: toAdStudioRunView(run) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
