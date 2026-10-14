import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentGrowthPilot, setGrowthPilotPaused } from '@growthos/firebase-orm-models';
import { requirePlatformOperator } from '@/lib/auth/operator-access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';

/**
 * An operator pauses or resumes any project's Growth Pilot (`{ organizationId, projectId, paused }`)
 * - the platform-wide stop for a pilot that misbehaves or burns its limits. Audited like the
 * customer's own pause. Platform operators only.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requirePlatformOperator();
  if (gate.error) return gate.error;
  const body = (await request.json().catch(() => null)) as { organizationId?: unknown; projectId?: unknown; paused?: unknown } | null;
  if (typeof body?.organizationId !== 'string' || typeof body.projectId !== 'string' || typeof body.paused !== 'boolean') return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  await ensureFirestoreOrm();
  const pilot = await getCurrentGrowthPilot(body.organizationId, body.projectId);
  if (!pilot) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const updated = await setGrowthPilotPaused({ organizationId: body.organizationId, projectId: body.projectId, pilotId: pilot.id, paused: body.paused, actorId: gate.user.id });
  return NextResponse.json({ status: updated.status });
}
