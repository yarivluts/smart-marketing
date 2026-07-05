import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { SESSION_COOKIE_NAME } from './lib/auth/constants';

const intlMiddleware = createIntlMiddleware(routing);

// Fail-closed, like the API's PermissionGuard (KAN-24): a locale-prefixed
// page is protected unless explicitly listed here.
const PUBLIC_PATHS = new Set(['/', '/login', '/signup']);
const AUTH_ONLY_PATHS = new Set(['/login', '/signup']);

export default function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const matchedLocale = routing.locales.find(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  if (matchedLocale) {
    const pathWithoutLocale = pathname.slice(`/${matchedLocale}`.length) || '/';
    const hasSession = request.cookies.has(SESSION_COOKIE_NAME);

    if (!PUBLIC_PATHS.has(pathWithoutLocale) && !hasSession) {
      const loginUrl = new URL(`/${matchedLocale}/login`, request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (AUTH_ONLY_PATHS.has(pathWithoutLocale) && hasSession) {
      return NextResponse.redirect(new URL(`/${matchedLocale}`, request.url));
    }
  }

  return intlMiddleware(request);
}

export const config = {
  // Skip API routes, Next internals, and files with an extension (static assets).
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
