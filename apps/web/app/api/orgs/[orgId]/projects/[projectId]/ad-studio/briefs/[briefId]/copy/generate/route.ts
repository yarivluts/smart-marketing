import { NextResponse, type NextRequest } from 'next/server';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { toAdStudioBriefView } from '@/lib/ad-studio/store';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { resolveAdStudioLlm, writeAdStudioCopy } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/**
 * Writes the ad copy (KAN-278) with the text model in one call: by default for every creative that
 * has none (the video and each image idea); `rewrite: true` writes it again, and `keys` ("video" or
 * idea ids) limits it to those creatives. Counts toward the daily text limit. Gated on `ai.use`.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const llm = resolveAdStudioLlm();
  if (!llm) return NextResponse.json({ error: 'provider_failed', code: 'not_configured' }, { status: 503 });
  const parsed = await parseJsonBody<{ rewrite?: unknown; keys?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body ?? {};
  const keys = Array.isArray(body.keys) ? body.keys.filter((key): key is string => typeof key === 'string') : undefined;
  try {
    const brief = await writeAdStudioCopy({ organizationId: orgId, projectId, briefId, actorId: user.id, llm, rewrite: body.rewrite === true, ...(keys ? { keys } : {}) });
    return NextResponse.json({ brief: toAdStudioBriefView(brief) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
