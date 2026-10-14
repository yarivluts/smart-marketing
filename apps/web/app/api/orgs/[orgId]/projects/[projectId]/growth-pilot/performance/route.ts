import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentGrowthPilot } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { loadGrowthPerformance } from '@/lib/ad-studio/engine';
import { growthPilotErrorResponse } from '@/lib/growth-pilot/http';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

const PERIODS = new Set([7, 30, 90]);

/**
 * How the pilot's published ads are doing over the last `days` (7, 30 or 90): Meta's own day-by-day
 * numbers for the campaigns the pilot created, summed per target and per day. Read-only; gated on `ai.use`.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const days = Number(request.nextUrl.searchParams.get('days') ?? '30');
  if (!PERIODS.has(days)) return NextResponse.json({ error: 'invalid_period' }, { status: 400 });
  try {
    await ensureFirestoreOrm();
    const pilot = await getCurrentGrowthPilot(orgId, projectId);
    if (!pilot) return NextResponse.json({ status: 'none' });
    return NextResponse.json(await loadGrowthPerformance({ organizationId: orgId, projectId, pilotId: pilot.id, days }));
  } catch (err) {
    return growthPilotErrorResponse(err);
  }
}
