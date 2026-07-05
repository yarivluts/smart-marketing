import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { verifyIdTokenMock, createSessionCookieMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  createSessionCookieMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminAuth: () => ({
    verifyIdToken: verifyIdTokenMock,
    createSessionCookie: createSessionCookieMock,
  }),
}));

import { POST } from './route';

function sessionRequest(body: unknown): NextRequest {
  return new NextRequest('https://growthos.test/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/session error differentiation', () => {
  it('returns 401 when the ID token itself fails verification (the caller sent a bad token)', async () => {
    verifyIdTokenMock.mockRejectedValue(new Error('invalid signature'));
    const response = await POST(sessionRequest({ idToken: 'bad-token' }));
    expect(response.status).toBe(401);
    expect(createSessionCookieMock).not.toHaveBeenCalled();
  });

  it('returns 500 when a verified token fails to mint a session cookie (our infra, not the caller)', async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'uid-1' });
    createSessionCookieMock.mockRejectedValue(new Error('admin sdk misconfigured'));
    const response = await POST(sessionRequest({ idToken: 'good-token' }));
    expect(response.status).toBe(500);
  });
});
