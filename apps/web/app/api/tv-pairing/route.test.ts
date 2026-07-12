import { beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { POST } from './route';

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

/** Every call in this suite gets its own IP so the mint-rate-limit bucket (shared per caller IP) never trips across unrelated test cases. */
function requestFrom(ip: string): NextRequest {
  return new NextRequest('https://growthos.test/api/tv-pairing', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
  });
}

describe('POST /api/tv-pairing', () => {
  it('mints a fresh, unclaimed pairing with no auth required', async () => {
    const response = await POST(requestFrom('203.0.113.1'));
    expect(response.status).toBe(201);
    const body = (await response.json()) as { deviceToken: string; code: string; codeExpiresAt: string };
    expect(body.deviceToken.length).toBeGreaterThan(20);
    expect(body.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(new Date(body.codeExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('mints a distinct token/code on every call', async () => {
    const first = (await (await POST(requestFrom('203.0.113.2'))).json()) as { deviceToken: string; code: string };
    const second = (await (await POST(requestFrom('203.0.113.3'))).json()) as { deviceToken: string; code: string };
    expect(first.deviceToken).not.toBe(second.deviceToken);
  });

  it('returns 429 with a Retry-After header once the per-IP bucket is exhausted', async () => {
    const ip = '203.0.113.9';
    let lastResponse = await POST(requestFrom(ip));
    for (let i = 0; i < 25 && lastResponse.status !== 429; i += 1) {
      lastResponse = await POST(requestFrom(ip));
    }
    expect(lastResponse.status).toBe(429);
    expect(lastResponse.headers.get('Retry-After')).toEqual(expect.any(String));
  });
});
