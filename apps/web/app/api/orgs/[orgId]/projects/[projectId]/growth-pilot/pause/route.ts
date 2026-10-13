import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentGrowthPilot, setGrowthPilotPaused } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { loadGrowthPilotPage } from '@/lib/growth-pilot/store';
import { growthPilotErrorResponse } from '@/lib/growth-pilot/http';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** Pauses (`{ paused: true }`) or resumes the pilot. Gated on `ai.use`; audited. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const body = (await request.json().catch(() => null)) as { paused?: unknown } | null;
  if (typeof body?.paused !== 'boolean') return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  try {
    await ensureFirestoreOrm();
    const pilot = await getCurrentGrowthPilot(orgId, projectId);
    if (!pilot) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await setGrowthPilotPaused({ organizationId: orgId, projectId, pilotId: pilot.id, paused: body.paused, actorId: user.id });
    return NextResponse.json(await loadGrowthPilotPage(orgId, projectId));
  } catch (err) {
    return growthPilotErrorResponse(err);
  }
}
