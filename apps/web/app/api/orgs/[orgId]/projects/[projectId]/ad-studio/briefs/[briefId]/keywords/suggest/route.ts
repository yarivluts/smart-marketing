import { NextResponse, type NextRequest } from 'next/server';
import { isSearchTargeting } from '@growthos/shared';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { resolveAdStudioLlm, suggestAdStudioKeywords } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/**
 * The AI chooses the search ad's keywords, match types and excluded searches for the chosen
 * `targeting` - from Google's own ideas when the project's Google Ads account can look them up,
 * otherwise from the brief and the plan (`researched: false` with the reason). Nothing is saved:
 * the person reviews the list and saves it. Counts toward the daily text limit. Gated on `ai.use`.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ seeds?: unknown; url?: unknown; targeting?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body ?? {};
  if (!isSearchTargeting(body.targeting)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const seeds = Array.isArray(body.seeds) ? body.seeds.filter((seed): seed is string => typeof seed === 'string') : [];
  const llm = resolveAdStudioLlm();
  if (!llm) return NextResponse.json({ error: 'provider_failed', code: 'not_configured' }, { status: 503 });
  try {
    const suggestion = await suggestAdStudioKeywords({
      organizationId: orgId,
      projectId,
      briefId,
      actorId: user.id,
      llm,
      targeting: body.targeting,
      seeds,
      url: typeof body.url === 'string' ? body.url : null,
    });
    return NextResponse.json({ suggestion });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
