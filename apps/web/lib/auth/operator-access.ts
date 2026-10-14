import 'server-only';
import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/get-server-session';
import { isPlatformOperator } from '@/lib/auth/platform-operator';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';

/**
 * Platform-wide operator surfaces (every customer's pilots, limits) are for GrowthOS operators only.
 * Anyone else - signed out, or a customer of any role - gets the same plain 404, so the surface does
 * not even reveal that it exists.
 */
export async function requirePlatformOperator(): Promise<{ user: { id: string; email: string | null }; error?: undefined } | { error: NextResponse }> {
  const session = await getServerSession();
  if (!session) return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) };
  const { user } = await resolveOrgSessionContext(session);
  if (!isPlatformOperator(user.email)) return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) };
  return { user: { id: user.id, email: user.email ?? null } };
}
