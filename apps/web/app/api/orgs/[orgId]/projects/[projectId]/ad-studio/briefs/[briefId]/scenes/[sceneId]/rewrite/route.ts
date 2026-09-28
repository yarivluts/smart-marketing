import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { resolveAdStudioLlm, proposeAdStudioSceneRewrite } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string; sceneId: string }>;
}

/**
 * Proposes a rewrite of one scene by an instruction ("more energy", "show the phone"). Returns the
 * proposal without saving it; the editor lets the person keep or discard it. Gated on `ai.use`.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId, sceneId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ instruction?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const instruction = typeof parsed.body?.instruction === 'string' ? parsed.body.instruction.slice(0, 500) : '';
  const llm = resolveAdStudioLlm();
  if (!llm) return NextResponse.json({ error: 'provider_failed', code: 'not_configured' }, { status: 503 });
  try {
    const scene = await proposeAdStudioSceneRewrite({ organizationId: orgId, projectId, briefId, sceneId, instruction, actorId: user.id, llm });
    return NextResponse.json({ scene });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
