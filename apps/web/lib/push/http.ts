import 'server-only';
import { NextResponse } from 'next/server';
import type { PushSubscriptionModel } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { ensureUserForSession } from '@/lib/orgs/session-context';

/** The signed-in user's platform id, or the 401 to return. */
export async function pushRouteUser(): Promise<{ userId: string; error?: undefined } | { userId?: undefined; error: NextResponse }> {
  const session = await getServerSession();
  if (!session) return { error: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  const user = await ensureUserForSession(session);
  return { userId: user.id };
}

export interface PushDeviceView {
  id: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

/** A device as the settings page lists it: never its endpoint or keys. */
export function toPushDeviceView(row: PushSubscriptionModel): PushDeviceView {
  return { id: row.id, label: row.device_label ?? null, createdAt: row.created_at, lastUsedAt: row.last_used_at ?? null };
}
