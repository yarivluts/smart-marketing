import { NextResponse, type NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';

const SESSION_EXPIRES_IN_MS = 1000 * 60 * 60 * 24 * 5;

/**
 * Exchanges a freshly-minted Firebase ID token for an httpOnly session
 * cookie. Called by the client right after sign-up/sign-in so that
 * `middleware.ts` (which cannot run the Admin SDK on the Edge runtime) can
 * gate protected routes without shipping the ID token itself to the client.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let idToken: unknown;
  try {
    ({ idToken } = (await request.json()) as { idToken?: unknown });
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (typeof idToken !== 'string' || idToken.length === 0) {
    return NextResponse.json({ error: 'id_token_required' }, { status: 400 });
  }

  try {
    const adminAuth = getAdminAuth();
    await adminAuth.verifyIdToken(idToken);
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRES_IN_MS,
    });

    const response = NextResponse.json({ status: 'ok' });
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      maxAge: SESSION_EXPIRES_IN_MS / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'invalid_id_token' }, { status: 401 });
  }
}

/** Clears the session cookie on sign-out. */
export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ status: 'ok' });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
