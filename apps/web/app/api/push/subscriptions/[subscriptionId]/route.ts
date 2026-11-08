import { NextResponse } from 'next/server';
import { PushSubscriptionNotFoundError, removePushSubscription } from '@growthos/firebase-orm-models';
import { pushRouteUser } from '@/lib/push/http';

interface RouteParams {
  params: Promise<{ subscriptionId: string }>;
}

/** Removes one of the signed-in user's devices; another person's device is "not found". */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { subscriptionId } = await params;
  const { userId, error } = await pushRouteUser();
  if (error) return error;
  try {
    await removePushSubscription(userId, subscriptionId);
    return NextResponse.json({ status: 'ok' });
  } catch (caught) {
    if (caught instanceof PushSubscriptionNotFoundError) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    throw caught;
  }
}
