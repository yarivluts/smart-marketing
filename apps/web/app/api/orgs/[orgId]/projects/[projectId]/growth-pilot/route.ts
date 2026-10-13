import { NextResponse, type NextRequest } from 'next/server';
import { startGrowthPilot } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { loadGrowthPilotPage } from '@/lib/growth-pilot/store';
import { growthPilotErrorResponse } from '@/lib/growth-pilot/http';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/** The project's Growth Pilot - site, targets, proposals and activity - or `{ pilot: null }` before one starts. Gated on `ai.use`. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  try {
    return NextResponse.json((await loadGrowthPilotPage(orgId, projectId)) ?? { pilot: null });
  } catch (err) {
    return growthPilotErrorResponse(err);
  }
}

/**
 * Starts Growth Pilot on a website (`{ siteUrl }`); starting over archives the previous pilot. The
 * site read itself happens on `advance`, which the page calls next. Gated on `ai.use`.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const body = (await request.json().catch(() => null)) as { siteUrl?: unknown } | null;
  try {
    await ensureFirestoreOrm();
    await startGrowthPilot({ organizationId: orgId, projectId, siteUrl: typeof body?.siteUrl === 'string' ? body.siteUrl : '', actorId: user.id });
    return NextResponse.json(await loadGrowthPilotPage(orgId, projectId), { status: 201 });
  } catch (err) {
    return growthPilotErrorResponse(err);
  }
}
