import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentGrowthPilot } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { requestGrowthTarget, resolveAdStudioLlm } from '@/lib/ad-studio/engine';
import { loadGrowthPilotPage } from '@/lib/growth-pilot/store';
import { growthPilotErrorResponse } from '@/lib/growth-pilot/http';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

export const maxDuration = 60;

/**
 * A new target in the person's own words (`{ request }`, e.g. "accountants in the north"): the AI
 * defines it and it waits for their approval. Counts one AI text call. Gated on `ai.use`.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const body = (await request.json().catch(() => null)) as { request?: unknown } | null;
  const llm = resolveAdStudioLlm();
  if (!llm) return NextResponse.json({ error: 'provider_failed', code: 'not_configured' }, { status: 503 });
  try {
    await ensureFirestoreOrm();
    const pilot = await getCurrentGrowthPilot(orgId, projectId);
    if (!pilot) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await requestGrowthTarget({ organizationId: orgId, projectId, actorId: user.id, llm, pilotId: pilot.id, request: typeof body?.request === 'string' ? body.request : '' });
    return NextResponse.json(await loadGrowthPilotPage(orgId, projectId), { status: 201 });
  } catch (err) {
    return growthPilotErrorResponse(err);
  }
}
