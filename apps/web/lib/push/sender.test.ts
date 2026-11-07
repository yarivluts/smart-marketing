import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPushPreferences, type PushPreferences } from '@growthos/shared';

const orm = vi.hoisted(() => ({
  preferences: new Map<string, PushPreferences>(),
  subscriptions: new Map<string, Array<{ id: string; endpoint: string; p256dh: string; auth: string; locale: string | null }>>(),
  deleted: [] as string[],
  touched: [] as string[],
}));

vi.mock('@growthos/firebase-orm-models', () => ({
  getPushPreferences: vi.fn(async (userId: string) => orm.preferences.get(userId) ?? defaultPushPreferences()),
  listPushSubscriptionsForUser: vi.fn(async (userId: string) => orm.subscriptions.get(userId) ?? []),
  deleteExpiredPushSubscription: vi.fn(async (id: string) => {
    orm.deleted.push(id);
  }),
  touchPushSubscription: vi.fn(async (id: string) => {
    orm.touched.push(id);
  }),
}));

const webPush = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock('web-push', () => ({ default: webPush }));

import { deliverTestToUser, deliverToUsers, webPushTransport } from './sender';

const CONFIG = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:ops@example.com' };

function device(id: string, locale: string | null = 'en') {
  return { id, endpoint: `https://push.example/${id}`, p256dh: `p-${id}`, auth: `a-${id}`, locale };
}

const payloadFor = vi.fn(async (locale: string | null) => ({ title: `title-${locale}`, body: 'body', url: '/en/dashboard' }));

beforeEach(() => {
  orm.preferences.clear();
  orm.subscriptions.clear();
  orm.deleted.length = 0;
  orm.touched.length = 0;
  webPush.sendNotification.mockReset();
  payloadFor.mockClear();
});

describe('deliverToUsers', () => {
  it('does nothing when push is not set up', async () => {
    orm.subscriptions.set('u1', [device('d1')]);
    const transport = vi.fn();
    const result = await deliverToUsers({ userIds: ['u1'], category: 'ready', payloadFor }, { transport, config: null });
    expect(result).toMatchObject({ status: 'not_configured', sent: 0 });
    expect(transport).not.toHaveBeenCalled();
  });

  it('sends to every device of each user, worded in the device language, and stamps delivery', async () => {
    orm.subscriptions.set('u1', [device('d1', 'he'), device('d2', 'en')]);
    orm.subscriptions.set('u2', [device('d3', null)]);
    const transport = vi.fn(async () => undefined);
    const result = await deliverToUsers({ userIds: ['u1', 'u2', 'u1'], category: 'ready', payloadFor }, { transport, config: CONFIG });
    expect(result).toMatchObject({ status: 'sent', sent: 3, failed: 0, removed: 0, optedOut: 0 });
    expect(transport).toHaveBeenCalledWith({ endpoint: 'https://push.example/d1', keys: { p256dh: 'p-d1', auth: 'a-d1' } }, JSON.stringify({ title: 'title-he', body: 'body', url: '/en/dashboard' }), CONFIG);
    expect(orm.touched.sort()).toEqual(['d1', 'd2', 'd3']);
  });

  it('skips people who turned everything off or this category off', async () => {
    const all = defaultPushPreferences();
    orm.preferences.set('off', { ...all, enabled: false });
    orm.preferences.set('no-ready', { ...all, categories: { ...all.categories, ready: false } });
    for (const user of ['off', 'no-ready', 'on']) orm.subscriptions.set(user, [device(`${user}-d`)]);
    const transport = vi.fn(async () => undefined);
    const result = await deliverToUsers({ userIds: ['off', 'no-ready', 'on'], category: 'ready', payloadFor }, { transport, config: CONFIG });
    expect(result).toMatchObject({ sent: 1, optedOut: 2 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toMatchObject({ endpoint: 'https://push.example/on-d' });
  });

  it('deletes a subscription the push service says is gone, and counts other failures without throwing', async () => {
    orm.subscriptions.set('u1', [device('gone'), device('expired'), device('flaky'), device('fine')]);
    const transport = vi.fn(async (target: { endpoint: string }) => {
      if (target.endpoint.endsWith('/gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      if (target.endpoint.endsWith('/expired')) throw Object.assign(new Error('Not found'), { statusCode: 404 });
      if (target.endpoint.endsWith('/flaky')) throw Object.assign(new Error('Server error'), { statusCode: 500 });
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await deliverToUsers({ userIds: ['u1'], category: 'failures', payloadFor }, { transport, config: CONFIG });
    warn.mockRestore();
    expect(result).toMatchObject({ sent: 1, removed: 2, failed: 1 });
    expect(orm.deleted.sort()).toEqual(['expired', 'gone']);
  });
});

describe('deliverTestToUser', () => {
  it('reaches every device even when the person turned categories off', async () => {
    orm.preferences.set('u1', { ...defaultPushPreferences(), enabled: false });
    orm.subscriptions.set('u1', [device('d1')]);
    const transport = vi.fn(async () => undefined);
    expect(await deliverTestToUser({ userId: 'u1', payloadFor }, { transport, config: CONFIG })).toMatchObject({ sent: 1 });
  });

  it('reports not set up without keys', async () => {
    expect(await deliverTestToUser({ userId: 'u1', payloadFor }, { config: null })).toMatchObject({ status: 'not_configured' });
  });
});

describe('webPushTransport', () => {
  it('sends through web-push with the VAPID details', async () => {
    webPush.sendNotification.mockResolvedValue({ statusCode: 201 });
    await webPushTransport({ endpoint: 'https://push.example/x', keys: { p256dh: 'p', auth: 'a' } }, '{"title":"t"}', CONFIG);
    expect(webPush.sendNotification).toHaveBeenCalledWith(
      { endpoint: 'https://push.example/x', keys: { p256dh: 'p', auth: 'a' } },
      '{"title":"t"}',
      expect.objectContaining({ vapidDetails: { subject: CONFIG.subject, publicKey: 'pub', privateKey: 'priv' } }),
    );
  });
});
