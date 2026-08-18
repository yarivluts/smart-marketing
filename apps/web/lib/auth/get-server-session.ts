import 'server-only';
import { cache } from 'react';
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
 *
 * Wrapped in React's `cache()` — every org/project `layout.tsx` and the
 * `page.tsx` it wraps each call this independently for the same request, and
 * without memoization that means two (or more) concurrent Admin SDK /
 * Firestore-emulator round trips per navigation. Found the hard way: PR #88's
 * new nav-shell layouts doubled that traffic and triggered gRPC stream
 * corruption in CI's Firestore emulator (`RESOURCE_EXHAUSTED` errors
 * reporting message sizes in the gigabytes) — a fragile-connection failure
 * mode this ORM has hit under concurrency before. `cache()` collapses every
 * call within one request to a single verification.
 */
export const getServerSession = cache(async (): Promise<DecodedIdToken | null> => {
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
});
