import { beforeAll, describe, expect, it } from 'vitest';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { POST } from './route';

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

describe('POST /api/tv-pairing', () => {
  it('mints a fresh, unclaimed pairing with no auth required', async () => {
    const response = await POST();
    expect(response.status).toBe(201);
    const body = (await response.json()) as { deviceToken: string; code: string; codeExpiresAt: string };
    expect(body.deviceToken.length).toBeGreaterThan(20);
    expect(body.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(new Date(body.codeExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('mints a distinct token/code on every call', async () => {
    const first = (await (await POST()).json()) as { deviceToken: string; code: string };
    const second = (await (await POST()).json()) as { deviceToken: string; code: string };
    expect(first.deviceToken).not.toBe(second.deviceToken);
  });
});
