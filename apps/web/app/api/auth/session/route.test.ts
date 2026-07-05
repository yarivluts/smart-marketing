import { beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, POST } from './route';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';

const EMULATOR_HOST = '127.0.0.1:9099';

beforeAll(() => {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = EMULATOR_HOST;
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
});

/** Mints a real Firebase ID token via the Auth emulator's REST API (no admin SDK round-trip needed to set one up). */
async function mintIdToken(email: string): Promise<string> {
  const response = await fetch(
    `http://${EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Sup3rSecret!', returnSecureToken: true }),
    },
  );
  const body = (await response.json()) as { idToken: string };
  return body.idToken;
}

function sessionRequest(body: unknown): NextRequest {
  return new NextRequest('https://growthos.test/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/session', () => {
  it('rejects a request with no idToken', async () => {
    const response = await POST(sessionRequest({}));
    expect(response.status).toBe(400);
  });

  it('rejects an idToken that does not verify', async () => {
    const response = await POST(sessionRequest({ idToken: 'not-a-real-token' }));
    expect(response.status).toBe(401);
  });

  it('sets an httpOnly session cookie for a valid Firebase ID token', async () => {
    const idToken = await mintIdToken(`session-route-${crypto.randomUUID()}@example.com`);
    const response = await POST(sessionRequest({ idToken }));

    expect(response.status).toBe(200);
    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);
  });

  it('sets a session cookie for a Google-federated (IdP) ID token', async () => {
    const response = await fetch(
      `http://${EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake-api-key`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postBody: `providerId=google.com&id_token=${encodeURIComponent(
            JSON.stringify({ sub: crypto.randomUUID(), email: 'federated@example.com', email_verified: true }),
          )}`,
          requestUri: 'https://growthos.test',
          returnIdpCredential: true,
          returnSecureToken: true,
        }),
      },
    );
    const { idToken } = (await response.json()) as { idToken: string };

    const sessionResponse = await POST(sessionRequest({ idToken }));
    expect(sessionResponse.status).toBe(200);
    expect(sessionResponse.cookies.get(SESSION_COOKIE_NAME)?.value).toBeTruthy();
  });
});

describe('DELETE /api/auth/session', () => {
  it('clears the session cookie', async () => {
    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe('');
  });
});
