import { NextResponse, type NextRequest } from 'next/server';
import { removePushSubscriptionByEndpoint } from '@growthos/firebase-orm-models';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { pushRouteUser } from '@/lib/push/http';

/** This browser stopped its subscription: forget it (by its endpoint, which only it knows). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { userId, error } = await pushRouteUser();
  if (error) return error;
  const parsed = await parseJsonBody<{ endpoint?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const endpoint = parsed.body?.endpoint;
  if (typeof endpoint !== 'string' || !endpoint.trim()) return NextResponse.json({ error: 'invalid_endpoint' }, { status: 400 });
  const removed = await removePushSubscriptionByEndpoint(userId, endpoint);
  return NextResponse.json({ removed });
}
