import { NextResponse, type NextRequest } from 'next/server';
import { getGrowthPlatformThresholds, setGrowthPlatformThresholds } from '@growthos/firebase-orm-models';
import { requirePlatformOperator } from '@/lib/auth/operator-access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { growthPilotErrorResponse } from '@/lib/growth-pilot/http';

/**
 * The Growth Pilot suggestion thresholds every project starts from, for GrowthOS operators only:
 * GET reads them (with the built-in values and the change history); PUT `{ thresholds }` sets them
 * (every value checked first); DELETE goes back to the built-in values. Each change is kept with who
 * made it. Anyone else gets a plain 404.
 */
export async function GET(): Promise<NextResponse> {
  const gate = await requirePlatformOperator();
  if (gate.error) return gate.error;
  await ensureFirestoreOrm();
  return NextResponse.json({ settings: await getGrowthPlatformThresholds() });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const gate = await requirePlatformOperator();
  if (gate.error) return gate.error;
  const body = (await request.json().catch(() => null)) as { thresholds?: unknown } | null;
  if (!body || body.thresholds === undefined) return NextResponse.json({ error: 'invalid_thresholds', invalid: ['thresholds'] }, { status: 400 });
  try {
    await ensureFirestoreOrm();
    return NextResponse.json({ settings: await setGrowthPlatformThresholds({ thresholds: body.thresholds, actorId: gate.user.id }) });
  } catch (err) {
    return growthPilotErrorResponse(err);
  }
}

export async function DELETE(): Promise<NextResponse> {
  const gate = await requirePlatformOperator();
  if (gate.error) return gate.error;
  await ensureFirestoreOrm();
  return NextResponse.json({ settings: await setGrowthPlatformThresholds({ thresholds: null, actorId: gate.user.id }) });
}
