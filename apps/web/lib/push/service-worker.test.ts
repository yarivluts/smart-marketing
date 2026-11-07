import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/** Runs public/sw.js against a fake worker scope and returns its event handlers. */
function loadWorker(windows: Array<{ url: string; focus: ReturnType<typeof vi.fn>; navigate?: ReturnType<typeof vi.fn> }> = []) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const scope = {
    location: { origin: 'https://app.example' },
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      handlers[type] = handler;
    },
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn(async () => undefined) },
    clients: { claim: vi.fn(async () => undefined), matchAll: vi.fn(async () => windows), openWindow: vi.fn(async () => undefined) },
  };
  const source = readFileSync(path.join(__dirname, '..', '..', 'public', 'sw.js'), 'utf8');
  new Function('self', source)(scope);
  return { handlers, scope };
}

function waitUntilEvent(extra: Record<string, unknown>) {
  let pending: Promise<unknown> = Promise.resolve();
  return {
    event: { ...extra, waitUntil: (promise: Promise<unknown>) => (pending = promise) },
    done: () => pending,
  };
}

describe('service worker', () => {
  it('has no fetch handler, so nothing is served from an offline copy', () => {
    const { handlers } = loadWorker();
    expect(Object.keys(handlers).sort()).toEqual(['activate', 'install', 'notificationclick', 'push']);
  });

  it('shows the pushed notification with a same-origin link only', async () => {
    const { handlers, scope } = loadWorker();
    const { event, done } = waitUntilEvent({ data: { json: () => ({ title: 'Ads ready', body: 'New ads', url: 'https://evil.example', tag: 't' }) } });
    handlers.push(event);
    await done();
    expect(scope.registration.showNotification).toHaveBeenCalledWith('Ads ready', expect.objectContaining({ body: 'New ads', tag: 't', data: { url: '/' } }));
  });

  it('focuses a tab already on the page, otherwise opens it', async () => {
    const onPage = { url: 'https://app.example/en/dashboard', focus: vi.fn(async () => undefined) };
    let worker = loadWorker([onPage]);
    let click = waitUntilEvent({ notification: { close: vi.fn(), data: { url: '/en/dashboard' } } });
    worker.handlers.notificationclick(click.event);
    await click.done();
    expect(onPage.focus).toHaveBeenCalled();
    expect(worker.scope.clients.openWindow).not.toHaveBeenCalled();

    worker = loadWorker([]);
    click = waitUntilEvent({ notification: { close: vi.fn(), data: { url: '/en/orgs/o/projects/p/growth-pilot' } } });
    worker.handlers.notificationclick(click.event);
    await click.done();
    expect(worker.scope.clients.openWindow).toHaveBeenCalledWith('https://app.example/en/orgs/o/projects/p/growth-pilot');
  });

  it('moves another open tab to the page, or opens a new one when it cannot', async () => {
    const other = { url: 'https://app.example/en/dashboard', focus: vi.fn(async () => undefined), navigate: vi.fn(async () => Promise.reject(new Error('not controlled'))) };
    const worker = loadWorker([other]);
    const click = waitUntilEvent({ notification: { close: vi.fn(), data: { url: '/en/dashboard/notifications' } } });
    worker.handlers.notificationclick(click.event);
    await click.done();
    expect(other.navigate).toHaveBeenCalledWith('https://app.example/en/dashboard/notifications');
    expect(worker.scope.clients.openWindow).toHaveBeenCalledWith('https://app.example/en/dashboard/notifications');
  });
});
