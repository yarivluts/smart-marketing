import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { toAdStudioBriefView } from '@/lib/ad-studio/store';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { parseScenes } from '@/lib/ad-studio/parse';
import { resolveAdStudioLlm, saveAdStudioScriptWithPronunciation } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/**
 * Saves a person's edit of the whole script. It must pass every scene rule (3-10 seconds each, 60
 * seconds total, a visual description per scene); otherwise 400 with each broken rule. Hebrew
 * narration without a pronunciation is vocalized first when a text model is configured (one call
 * toward the daily text limit, best effort). Gated on `ai.use`.
 */
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ scenes?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const scenes = parseScenes(parsed.body?.scenes);
  if (!scenes) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    const brief = await saveAdStudioScriptWithPronunciation({ organizationId: orgId, projectId, briefId, scenes, actorId: user.id, llm: resolveAdStudioLlm() });
    return NextResponse.json({ brief: toAdStudioBriefView(brief) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
