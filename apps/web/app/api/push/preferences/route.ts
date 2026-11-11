import { NextResponse, type NextRequest } from 'next/server';
import { getPushPreferences, setPushPreferences } from '@growthos/firebase-orm-models';
import { isPushCategory, type PushCategory } from '@growthos/shared';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { pushRouteUser } from '@/lib/push/http';

export const dynamic = 'force-dynamic';

/** The signed-in user's notification choices. */
export async function GET(): Promise<NextResponse> {
  const { userId, error } = await pushRouteUser();
  if (error) return error;
  return NextResponse.json({ preferences: await getPushPreferences(userId) });
}

/** Changes the master switch and/or categories: `{ enabled?: boolean, categories?: { ready?: boolean, ... } }`. */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const { userId, error } = await pushRouteUser();
  if (error) return error;
  const parsed = await parseJsonBody<{ enabled?: unknown; categories?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const { enabled, categories } = parsed.body ?? {};
  if (enabled !== undefined && typeof enabled !== 'boolean') return NextResponse.json({ error: 'invalid_preferences' }, { status: 400 });
  const changes: Partial<Record<PushCategory, boolean>> = {};
  if (categories !== undefined) {
    if (!categories || typeof categories !== 'object' || Array.isArray(categories)) return NextResponse.json({ error: 'invalid_preferences' }, { status: 400 });
    for (const [key, value] of Object.entries(categories)) {
      if (!isPushCategory(key) || typeof value !== 'boolean') return NextResponse.json({ error: 'invalid_preferences' }, { status: 400 });
      changes[key] = value;
    }
  }
  const preferences = await setPushPreferences({ userId, enabled: enabled as boolean | undefined, categories: changes });
  return NextResponse.json({ preferences });
}
