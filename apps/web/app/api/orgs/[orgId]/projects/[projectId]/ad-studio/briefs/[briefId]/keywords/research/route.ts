import { NextResponse, type NextRequest } from 'next/server';
import { isSearchTargeting } from '@growthos/shared';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { researchAdStudioKeywords } from '@/lib/ad-studio/engine';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/**
 * Keyword research for the ad's search ad: Google's monthly volumes, competition and top-of-page
 * bids for `seeds` (and/or a `url`) in the chosen `targeting` ({country, language}). Answers 200
 * with `{status: 'unavailable', reason}` when the project has no usable Google Ads credential or
 * Google refused, so the page can say why. Nothing is saved. Gated on `ai.use`.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ seeds?: unknown; url?: unknown; targeting?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body ?? {};
  const seeds = Array.isArray(body.seeds) ? body.seeds.filter((seed): seed is string => typeof seed === 'string') : [];
  if (!isSearchTargeting(body.targeting)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    const research = await researchAdStudioKeywords({ organizationId: orgId, projectId, seeds, url: typeof body.url === 'string' ? body.url : null, targeting: body.targeting });
    return NextResponse.json({ research });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
