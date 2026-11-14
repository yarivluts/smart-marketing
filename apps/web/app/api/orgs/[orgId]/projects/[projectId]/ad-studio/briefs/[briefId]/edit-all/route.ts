import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { listBriefVideo, resolveAdStudioVideoDeps, startEditAll } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/**
 * Applies one conversational edit instruction across every scene with a ready clip and nothing in
 * flight, chained from each clip's Gemini interaction (KAN-231). Checks the whole batch against the
 * daily video-seconds limit first, so it starts or is refused as one. Gated on `ai.use`.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ instruction?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const instruction = typeof parsed.body?.instruction === 'string' ? parsed.body.instruction.slice(0, 500) : '';
  const deps = resolveAdStudioVideoDeps();
  if (!deps.omni) return NextResponse.json({ error: 'provider_failed', code: 'not_configured' }, { status: 503 });
  try {
    const started = await startEditAll(
      { organizationId: orgId, projectId, briefId, instruction, actorId: user.id },
      { ...deps, omni: deps.omni },
    );
    return NextResponse.json({ started: started.length, ...(await listBriefVideo({ organizationId: orgId, projectId, briefId })) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
