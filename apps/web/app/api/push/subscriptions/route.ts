import { NextResponse, type NextRequest } from 'next/server';
import { listPushSubscriptionsForUser, pushSubscriptionId, PushSubscriptionInvalidError, savePushSubscription } from '@growthos/firebase-orm-models';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { resolveWebPushConfig } from '@/lib/push/config';
import { pushRouteUser, toPushDeviceView } from '@/lib/push/http';

export const dynamic = 'force-dynamic';

/**
 * The signed-in user's subscribed devices. `?endpoint=` (this browser's own push endpoint) marks
 * which one is the device asking.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { userId, error } = await pushRouteUser();
  if (error) return error;
  const endpoint = request.nextUrl.searchParams.get('endpoint');
  const current = endpoint ? pushSubscriptionId(endpoint.trim()) : null;
  const rows = await listPushSubscriptionsForUser(userId);
  return NextResponse.json({ devices: rows.map((row) => ({ ...toPushDeviceView(row), current: row.id === current })) });
}

interface SubscribeBody {
  subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  deviceLabel?: unknown;
  locale?: unknown;
}

/** Saves this browser's push subscription for the signed-in user (again is fine: it refreshes). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { userId, error } = await pushRouteUser();
  if (error) return error;
  if (!resolveWebPushConfig()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const parsed = await parseJsonBody<SubscribeBody>(request);
  if (parsed.error) return parsed.error;
  const subscription = parsed.body?.subscription;
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') {
    return NextResponse.json({ error: 'invalid_subscription' }, { status: 400 });
  }
  try {
    const row = await savePushSubscription({
      userId,
      endpoint,
      p256dh,
      auth,
      deviceLabel: typeof parsed.body.deviceLabel === 'string' ? parsed.body.deviceLabel : null,
      userAgent: request.headers.get('user-agent'),
      locale: typeof parsed.body.locale === 'string' ? parsed.body.locale : null,
    });
    return NextResponse.json({ device: { ...toPushDeviceView(row), current: true } }, { status: 201 });
  } catch (caught) {
    if (caught instanceof PushSubscriptionInvalidError) return NextResponse.json({ error: 'invalid_subscription' }, { status: 400 });
    throw caught;
  }
}
