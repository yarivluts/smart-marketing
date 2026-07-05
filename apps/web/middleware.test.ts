// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from './lib/auth/constants';

const { intlMiddlewareMock } = vi.hoisted(() => ({ intlMiddlewareMock: vi.fn() }));

// next-intl's own middleware has its own upstream tests; this file only
// exercises the auth-gating composition around it, and mocking it out
// sidesteps a pnpm/Vite ESM resolution quirk with next-intl's nested `next`
// dependency that has nothing to do with our code.
vi.mock('next-intl/middleware', () => ({
  default: () => intlMiddlewareMock,
}));

import middleware from './middleware';

function requestFor(path: string, options: { cookie?: string } = {}): NextRequest {
  const headers = new Headers();
  if (options.cookie) {
    headers.set('cookie', options.cookie);
  }
  return new NextRequest(new URL(path, 'https://growthos.test'), { headers });
}

describe('middleware', () => {
  it('redirects an unauthenticated visitor away from a protected, locale-prefixed route', () => {
    const response = middleware(requestFor('/en/dashboard'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://growthos.test/en/login?from=%2Fen%2Fdashboard');
  });

  it('passes an authenticated visitor through to a protected route', () => {
    intlMiddlewareMock.mockReturnValue(NextResponse.next());
    const response = middleware(requestFor('/en/dashboard', { cookie: `${SESSION_COOKIE_NAME}=abc` }));
    expect(response.headers.get('location')).toBeNull();
    expect(intlMiddlewareMock).toHaveBeenCalled();
  });

  it('lets an unauthenticated visitor reach the login page', () => {
    intlMiddlewareMock.mockReturnValue(NextResponse.next());
    const response = middleware(requestFor('/en/login'));
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects an already-authenticated visitor away from the login page', () => {
    const response = middleware(requestFor('/en/login', { cookie: `${SESSION_COOKIE_NAME}=abc` }));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://growthos.test/en');
  });

  it('lets an unauthenticated visitor reach the public home page', () => {
    intlMiddlewareMock.mockReturnValue(NextResponse.next());
    const response = middleware(requestFor('/en'));
    expect(response.headers.get('location')).toBeNull();
  });

  it('defers to the i18n middleware for a path with no locale prefix yet', () => {
    // Simulates next-intl's real behavior of inserting the default locale.
    intlMiddlewareMock.mockReturnValue(NextResponse.redirect(new URL('/en/dashboard', 'https://growthos.test')));
    const response = middleware(requestFor('/dashboard'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://growthos.test/en/dashboard');
  });
});
