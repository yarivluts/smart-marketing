import { NextResponse } from 'next/server';
import { buildTestPayload } from '@/lib/push/messages';
import { pushRouteUser } from '@/lib/push/http';
import { deliverTestToUser } from '@/lib/push/sender';

/** Sends a test notification to every device of the signed-in user. */
export async function POST(): Promise<NextResponse> {
  const { userId, error } = await pushRouteUser();
  if (error) return error;
  const result = await deliverTestToUser({ userId, payloadFor: buildTestPayload });
  if (result.status === 'not_configured') return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  if (result.sent === 0 && result.failed === 0) return NextResponse.json({ error: 'no_devices', removed: result.removed }, { status: 409 });
  return NextResponse.json({ sent: result.sent, failed: result.failed, removed: result.removed });
}
