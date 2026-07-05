import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { SESSION_COOKIE_NAME } from './lib/auth/constants';

const intlMiddleware = createIntlMiddleware(routing);

// Fail-closed, like the API's PermissionGuard (KAN-24): a locale-prefixed
// page is protected unless explicitly listed here.
const PUBLIC_PATHS = new Set(['/', '/login', '/signup']);

export default function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const matchedLocale = routing.locales.find(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  if (matchedLocale) {
    const pathWithoutLocale = pathname.slice(`/${matchedLocale}`.length) || '/';
    // Only checks the cookie's *presence* — the Edge runtime this middleware
    // runs on can't call the Admin SDK to verify it. That's fine for gating
    // protected routes (a real check follows server-side, e.g.
    // lib/auth/get-server-session.ts in dashboard/page.tsx), but it must
    // never be used to redirect *away* from login/signup: a stale or forged
    // cookie would then bounce a visitor away from the one page that could
    // get them a real session, with no way back in.
    const hasSession = request.cookies.has(SESSION_COOKIE_NAME);

    if (!PUBLIC_PATHS.has(pathWithoutLocale) && !hasSession) {
      const loginUrl = new URL(`/${matchedLocale}/login`, request.url);
      // Locale-agnostic (no `/${matchedLocale}` prefix) so the login form can
      // hand it straight to next-intl's locale-prefixing router without
      // double-prefixing.
      loginUrl.searchParams.set('from', pathWithoutLocale);
      return NextResponse.redirect(loginUrl);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  // Skip API routes, Next internals, and files with an extension (static assets).
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
