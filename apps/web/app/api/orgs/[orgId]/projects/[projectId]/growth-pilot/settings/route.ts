import { NextResponse, type NextRequest } from 'next/server';
import { getGrowthProjectThresholds, setGrowthProjectThresholds } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { growthPilotErrorResponse } from '@/lib/growth-pilot/http';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * The project's Growth Pilot suggestion thresholds, for its admins (`project.manage`): GET reads the
 * effective values, the project's own and the platform defaults; PUT `{ thresholds }` sets the
 * project's own (only those given override the platform; every value is checked first); DELETE
 * resets the project to the platform defaults. Changes are audited.
 */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'project.manage');
  if (error) return error;
  try {
    await ensureFirestoreOrm();
    return NextResponse.json({ settings: await getGrowthProjectThresholds(orgId, projectId) });
  } catch (err) {
    return growthPilotErrorResponse(err);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'project.manage');
  if (error) return error;
  const body = (await request.json().catch(() => null)) as { thresholds?: unknown } | null;
  if (!body || body.thresholds === undefined) return NextResponse.json({ error: 'invalid_thresholds', invalid: ['thresholds'] }, { status: 400 });
  try {
    await ensureFirestoreOrm();
    return NextResponse.json({ settings: await setGrowthProjectThresholds({ organizationId: orgId, projectId, thresholds: body.thresholds, actorId: user.id }) });
  } catch (err) {
    return growthPilotErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'project.manage');
  if (error) return error;
  try {
    await ensureFirestoreOrm();
    return NextResponse.json({ settings: await setGrowthProjectThresholds({ organizationId: orgId, projectId, thresholds: null, actorId: user.id }) });
  } catch (err) {
    return growthPilotErrorResponse(err);
  }
}
