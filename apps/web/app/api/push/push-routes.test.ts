import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { NextRequest } from 'next/server';
import { ensureUserForFirebaseSession, listPushSubscriptionsForUser, PushSubscriptionModel } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { GET as getConfig } from './config/route';
import { DELETE as deleteDevice } from './subscriptions/[subscriptionId]/route';
import { GET as listDevices, POST as subscribe } from './subscriptions/route';
import { POST as unsubscribe } from './unsubscribe/route';
import { GET as getPreferences, PATCH as patchPreferences } from './preferences/route';
import { POST as sendTest } from './test/route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));

const webPush = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock('web-push', () => ({ default: webPush }));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

beforeEach(() => {
  getServerSessionMock.mockReset();
  webPush.sendNotification.mockReset();
  process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'test-public-key';
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'test-private-key';
});

afterEach(() => {
  delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function signIn(): Promise<string> {
  const uid = unique('uid');
  const email = `${unique('push')}@example.com`;
  const user = await ensureUserForFirebaseSession({ firebaseUid: uid, email });
  getServerSessionMock.mockResolvedValue({ uid, email, email_verified: true } as DecodedIdToken);
  return user.id;
}

function json(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`https://growthos.test${url}`, {
    method,
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function subscription(endpoint = `https://fcm.googleapis.com/fcm/send/${unique('device')}`) {
  return { endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } };
}

describe('GET /api/push/config', () => {
  it('says whether push is set up and gives only the public key', async () => {
    expect(await getConfig().json()).toEqual({ configured: true, publicKey: 'test-public-key' });
    delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    expect(await getConfig().json()).toEqual({ configured: false, publicKey: null });
  });
});

describe('push routes need a session', () => {
  it('returns 401 when signed out', async () => {
    getServerSessionMock.mockResolvedValue(null);
    expect((await listDevices(json('/api/push/subscriptions', 'GET'))).status).toBe(401);
    expect((await subscribe(json('/api/push/subscriptions', 'POST', { subscription: subscription() }))).status).toBe(401);
    expect((await deleteDevice(new Request('https://growthos.test'), { params: Promise.resolve({ subscriptionId: 'x' }) })).status).toBe(401);
    expect((await unsubscribe(json('/api/push/unsubscribe', 'POST', { endpoint: 'https://x' }))).status).toBe(401);
    expect((await getPreferences()).status).toBe(401);
    expect((await patchPreferences(json('/api/push/preferences', 'PATCH', { enabled: false }))).status).toBe(401);
    expect((await sendTest()).status).toBe(401);
  });
});

describe('subscribing and devices', () => {
  it('saves this browser, lists it as the current device without its endpoint, and removes it', async () => {
    const userId = await signIn();
    const sub = subscription();
    const created = await subscribe(json('/api/push/subscriptions', 'POST', { subscription: sub, deviceLabel: 'Chrome · Android', locale: 'he' }));
    expect(created.status).toBe(201);
    const { device } = (await created.json()) as { device: { id: string } };
    const stored = await PushSubscriptionModel.init(device.id);
    expect(stored).toMatchObject({ user_id: userId, locale: 'he', device_label: 'Chrome · Android', user_agent: expect.stringContaining('Android') });

    const listed = await listDevices(json(`/api/push/subscriptions?endpoint=${encodeURIComponent(sub.endpoint)}`, 'GET'));
    const body = (await listed.json()) as { devices: Array<Record<string, unknown>> };
    expect(body.devices).toEqual([expect.objectContaining({ id: device.id, label: 'Chrome · Android', current: true })]);
    expect(JSON.stringify(body)).not.toContain(sub.endpoint);
    expect(JSON.stringify(body)).not.toContain('auth-key');

    expect((await deleteDevice(new Request('https://growthos.test'), { params: Promise.resolve({ subscriptionId: device.id }) })).status).toBe(200);
    expect(await listPushSubscriptionsForUser(userId)).toHaveLength(0);
  });

  it('refuses a malformed subscription, and refuses to subscribe when push is not set up', async () => {
    await signIn();
    expect((await subscribe(json('/api/push/subscriptions', 'POST', { subscription: { endpoint: 'https://x.example' } }))).status).toBe(400);
    expect((await subscribe(json('/api/push/subscriptions', 'POST', { subscription: subscription('http://insecure.example/x') }))).status).toBe(400);
    delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    expect((await subscribe(json('/api/push/subscriptions', 'POST', { subscription: subscription() }))).status).toBe(503);
  });

  it("cannot remove someone else's device", async () => {
    await signIn();
    const created = await subscribe(json('/api/push/subscriptions', 'POST', { subscription: subscription() }));
    const { device } = (await created.json()) as { device: { id: string } };
    await signIn();
    expect((await deleteDevice(new Request('https://growthos.test'), { params: Promise.resolve({ subscriptionId: device.id }) })).status).toBe(404);
    expect(await PushSubscriptionModel.init(device.id)).not.toBeNull();
  });

  it('forgets this browser by its endpoint when it unsubscribes', async () => {
    const userId = await signIn();
    const sub = subscription();
    await subscribe(json('/api/push/subscriptions', 'POST', { subscription: sub }));
    expect(await (await unsubscribe(json('/api/push/unsubscribe', 'POST', { endpoint: sub.endpoint }))).json()).toEqual({ removed: true });
    expect(await listPushSubscriptionsForUser(userId)).toHaveLength(0);
    expect((await unsubscribe(json('/api/push/unsubscribe', 'POST', {}))).status).toBe(400);
  });
});

describe('preferences', () => {
  it('starts all on, and saves the master switch and categories', async () => {
    await signIn();
    expect(await (await getPreferences()).json()).toEqual({ preferences: { enabled: true, categories: { approvals: true, ready: true, publishing: true, failures: true } } });
    const changed = await patchPreferences(json('/api/push/preferences', 'PATCH', { categories: { failures: false } }));
    expect(await changed.json()).toEqual({ preferences: { enabled: true, categories: { approvals: true, ready: true, publishing: true, failures: false } } });
    await patchPreferences(json('/api/push/preferences', 'PATCH', { enabled: false }));
    expect(((await (await getPreferences()).json()) as { preferences: { enabled: boolean; categories: { failures: boolean } } }).preferences).toMatchObject({ enabled: false, categories: { failures: false } });
  });

  it('refuses unknown categories and non-boolean values', async () => {
    await signIn();
    expect((await patchPreferences(json('/api/push/preferences', 'PATCH', { enabled: 'yes' }))).status).toBe(400);
    expect((await patchPreferences(json('/api/push/preferences', 'PATCH', { categories: { marketing: true } }))).status).toBe(400);
    expect((await patchPreferences(json('/api/push/preferences', 'PATCH', { categories: { ready: 1 } }))).status).toBe(400);
  });
});

describe('POST /api/push/test', () => {
  it('sends to the user’s devices and drops one the push service says is gone', async () => {
    const userId = await signIn();
    const kept = subscription();
    const gone = subscription();
    await subscribe(json('/api/push/subscriptions', 'POST', { subscription: kept, locale: 'en' }));
    await subscribe(json('/api/push/subscriptions', 'POST', { subscription: gone, locale: 'en' }));
    webPush.sendNotification.mockImplementation(async (target: { endpoint: string }) => {
      if (target.endpoint === gone.endpoint) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      return { statusCode: 201 };
    });
    const response = await sendTest();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 1, failed: 0, removed: 1 });
    const payload = JSON.parse(webPush.sendNotification.mock.calls.find(([target]) => target.endpoint === kept.endpoint)![1] as string);
    expect(payload).toMatchObject({ title: 'GrowthOS notifications work', url: '/en/dashboard/notifications' });
    expect((await listPushSubscriptionsForUser(userId)).map((row) => row.endpoint)).toEqual([kept.endpoint]);
  });

  it('says when there is no device, and when push is not set up', async () => {
    await signIn();
    expect((await sendTest()).status).toBe(409);
    delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    expect((await sendTest()).status).toBe(503);
  });
});
