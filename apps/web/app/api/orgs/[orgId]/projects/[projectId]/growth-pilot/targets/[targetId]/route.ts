import { NextResponse, type NextRequest } from 'next/server';
import { isGrowthChangeArea } from '@growthos/shared';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { changeGrowthBudget, changeGrowthTarget, requestGrowthTargetVideo, resolveAdStudioAutopilotDeps, resolveAdStudioImageDeps, resolveAdStudioLlm, resolveAdStudioVideoDeps } from '@/lib/ad-studio/engine';
import { loadGrowthPilotPage } from '@/lib/growth-pilot/store';
import { growthPilotErrorResponse } from '@/lib/growth-pilot/http';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; targetId: string }>;
}

// A change to the ads rewrites every image idea before the new render starts: allow for a slow model.
export const maxDuration = 300;

/**
 * The person's request on a target they already approved:
 * - `{ action: 'change', area: 'ads' | 'landing' | 'audience', request }` - redo that part in their
 *   words. While the part still waits for a decision, the waiting proposal is revised instead.
 *   The new part comes back as a proposal; the request and how it went are kept on the target.
 *   For ads already on Meta, a new audience comes back as a proposal that changes the live ad set.
 * - `{ action: 'video' }` - make the target's video ad (none yet, or the last one failed).
 * - `{ action: 'budget', dailyBudget }` - set the daily budget of its live ads on Meta. This spends
 *   real money, so it needs `automation.execute` (like publishing and turning ads on), and the page
 *   only sends it after the person confirmed the new amount and currency.
 * Returns the page data. Gated on `ai.use`, like every other Growth Pilot request; changes count AI
 * calls against the project's daily limits.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, targetId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const body = (await request.json().catch(() => null)) as { action?: unknown; area?: unknown; request?: unknown; dailyBudget?: unknown } | null;
  const action = body?.action;
  const area = body?.area;
  if (action !== 'change' && action !== 'video' && action !== 'budget') return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  if (action === 'change' && !isGrowthChangeArea(area)) return NextResponse.json({ error: 'invalid_area' }, { status: 400 });
  try {
    if (action === 'budget') {
      const gate = await requireProjectPermission(orgId, projectId, 'automation.execute');
      if (gate.error) return gate.error;
      if (typeof body?.dailyBudget !== 'number') return NextResponse.json({ error: 'invalid_budget' }, { status: 400 });
      await ensureFirestoreOrm();
      await changeGrowthBudget({ organizationId: orgId, projectId, actorId: user.id, targetId, dailyBudget: body.dailyBudget });
      return NextResponse.json(await loadGrowthPilotPage(orgId, projectId));
    }
    const llm = resolveAdStudioLlm();
    if (!llm) return NextResponse.json({ error: 'provider_failed', code: 'not_configured' }, { status: 503 });
    await ensureFirestoreOrm();
    const ctx = { organizationId: orgId, projectId, actorId: user.id, llm, targetId };
    if (action === 'change' && isGrowthChangeArea(area)) {
      await changeGrowthTarget({ ...ctx, area, request: typeof body?.request === 'string' ? body.request : '' });
    } else {
      await requestGrowthTargetVideo({ ...ctx, autopilot: resolveAdStudioAutopilotDeps(resolveAdStudioVideoDeps(), resolveAdStudioImageDeps()) });
    }
    return NextResponse.json(await loadGrowthPilotPage(orgId, projectId));
  } catch (err) {
    return growthPilotErrorResponse(err);
  }
}
