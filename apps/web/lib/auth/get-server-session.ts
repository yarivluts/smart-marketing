import 'server-only';
import { cookies } from 'next/headers';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getAdminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME } from './constants';

/**
 * Cryptographically verifies the session cookie server-side. `middleware.ts`
 * only checks whether the cookie is *present* (it runs on the Edge runtime,
 * which can't run the Admin SDK) — every protected Server Component must
 * call this to actually enforce the session before rendering or fetching
 * gated data, the same way every API route must call `PermissionGuard`
 * (KAN-24). Returns `null` for a missing, expired, or tampered cookie.
 */
export async function getServerSession(): Promise<DecodedIdToken | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    return null;
  }
  try {
    return await getAdminAuth().verifySessionCookie(sessionCookie, true);
  } catch {
    return null;
  }
}
