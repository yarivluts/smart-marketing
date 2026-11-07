import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../messages/en.json';
import { setDeferredInstallPromptForTest, type BeforeInstallPromptEvent } from '@/lib/push/install-prompt';

const browser = vi.hoisted(() => ({
  supported: true,
  permission: 'default' as 'default' | 'granted' | 'denied' | 'unsupported',
  ios: false,
  iosNeedsInstall: false,
  standalone: false,
  configured: true,
  subscription: null as { endpoint: string } | null,
}));

const client = vi.hoisted(() => ({ subscribeThisDevice: vi.fn(), unsubscribeThisDevice: vi.fn() }));

vi.mock('@/lib/push/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/push/client')>();
  return {
    ...actual,
    isPushSupported: () => browser.supported,
    notificationPermission: () => browser.permission,
    isIos: () => browser.ios,
    needsIosInstallForPush: () => browser.iosNeedsInstall,
    isStandalone: () => browser.standalone,
    fetchPushConfig: async () => ({ configured: browser.configured, publicKey: browser.configured ? 'pub-key' : null }),
    currentSubscription: async () => browser.subscription,
    subscribeThisDevice: client.subscribeThisDevice,
    unsubscribeThisDevice: client.unsubscribeThisDevice,
  };
});

import { NotificationSettings } from './notification-settings';

interface Call {
  url: string;
  method: string;
  body: unknown;
}

let calls: Call[] = [];
let devices: Array<Record<string, unknown>> = [];
let preferences = { enabled: true, categories: { approvals: true, ready: true, publishing: true, failures: true } };
let testStatus = 200;
const requestPermission = vi.fn();

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? 'GET';
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ url, method, body });
  if (url.startsWith('/api/push/preferences')) {
    if (method === 'PATCH') {
      preferences = { enabled: body.enabled ?? preferences.enabled, categories: { ...preferences.categories, ...body.categories } };
    }
    return respond(200, { preferences });
  }
  if (url.startsWith('/api/push/subscriptions/') && method === 'DELETE') {
    devices = devices.filter((device) => !url.endsWith(String(device.id)));
    return respond(200, { status: 'ok' });
  }
  if (url.startsWith('/api/push/subscriptions')) return respond(200, { devices });
  if (url.startsWith('/api/push/test')) return respond(testStatus, testStatus === 200 ? { sent: 1 } : { error: 'no_devices' });
  return respond(404, {});
});

function renderSettings() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <NotificationSettings />
    </NextIntlClientProvider>,
  );
}

async function loaded() {
  await waitFor(() => expect(calls.some((call) => call.url.startsWith('/api/push/subscriptions'))).toBe(true));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  Object.assign(browser, { supported: true, permission: 'default', ios: false, iosNeedsInstall: false, standalone: false, configured: true, subscription: null });
  calls = [];
  devices = [];
  preferences = { enabled: true, categories: { approvals: true, ready: true, publishing: true, failures: true } };
  testStatus = 200;
  client.subscribeThisDevice.mockReset().mockResolvedValue({ endpoint: 'https://push.example/new' });
  client.unsubscribeThisDevice.mockReset().mockResolvedValue(undefined);
  requestPermission.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('Notification', { requestPermission, permission: 'default' });
  setDeferredInstallPromptForTest(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NotificationSettings', () => {
  it('not asked yet: offers to turn notifications on, asking the browser only on the click', async () => {
    requestPermission.mockResolvedValue('granted');
    renderSettings();
    await loaded();
    expect(screen.getByTestId('push-permission')).toHaveTextContent('Not asked yet');
    expect(screen.getByTestId('push-device-state')).toHaveTextContent('Notifications off');
    expect(requestPermission).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on notifications' }));
    await waitFor(() => expect(client.subscribeThisDevice).toHaveBeenCalledWith('pub-key', 'en'));
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('allowed and subscribed: lists this device, turns it off here, and sends a test', async () => {
    Object.assign(browser, { permission: 'granted', subscription: { endpoint: 'https://push.example/mine' } });
    devices = [
      { id: 'd1', label: 'Chrome · Android', createdAt: '2026-11-01T10:00:00.000Z', lastUsedAt: '2026-11-02T10:00:00.000Z', current: true },
      { id: 'd2', label: null, createdAt: '2026-10-01T10:00:00.000Z', lastUsedAt: null, current: false },
    ];
    renderSettings();
    await loaded();
    expect(calls.find((call) => call.url.startsWith('/api/push/subscriptions'))?.url).toBe(`/api/push/subscriptions?endpoint=${encodeURIComponent('https://push.example/mine')}`);
    expect(screen.getByTestId('push-permission')).toHaveTextContent('Allowed');
    expect(screen.getByTestId('push-device-state')).toHaveTextContent('Notifications on');
    const list = screen.getByTestId('push-devices');
    expect(within(list).getByText('This device')).toBeInTheDocument();
    expect(within(list).getByText('Unknown device')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Send a test notification' }));
    await waitFor(() => expect(calls.some((call) => call.url === '/api/push/test' && call.method === 'POST')).toBe(true));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Unknown device' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Remove Unknown device' }));
    await waitFor(() => expect(calls.some((call) => call.url === '/api/push/subscriptions/d2' && call.method === 'DELETE')).toBe(true));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Turn off on this device' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Turn off on this device' }));
    await waitFor(() => expect(client.unsubscribeThisDevice).toHaveBeenCalled());
  });

  it('removing this device stops push in this browser too', async () => {
    Object.assign(browser, { permission: 'granted', subscription: { endpoint: 'https://push.example/mine' } });
    devices = [{ id: 'd1', label: 'Chrome · Windows', createdAt: '2026-11-01T10:00:00.000Z', lastUsedAt: null, current: true }];
    renderSettings();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Chrome · Windows' }));
    await waitFor(() => expect(client.unsubscribeThisDevice).toHaveBeenCalled());
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
  });

  it('saves the master switch and each category', async () => {
    renderSettings();
    await loaded();
    fireEvent.click(screen.getByRole('switch', { name: 'Problems' }));
    await waitFor(() => expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ categories: { failures: false } }));
    fireEvent.click(screen.getByRole('switch', { name: 'All notifications' }));
    await waitFor(() => expect(calls.filter((call) => call.method === 'PATCH').at(-1)?.body).toEqual({ enabled: false }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Waiting for your approval' })).toBeDisabled());
  });

  it('blocked: explains how to allow it again, with no button that cannot work', async () => {
    browser.permission = 'denied';
    renderSettings();
    await loaded();
    expect(screen.getByTestId('push-permission')).toHaveTextContent('Blocked');
    expect(screen.getByTestId('push-denied-help')).toHaveTextContent('site settings');
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).not.toBeInTheDocument();
  });

  it('unsupported browser: says so', async () => {
    Object.assign(browser, { supported: false, permission: 'unsupported' });
    renderSettings();
    await loaded();
    expect(screen.getByText("This browser can't show notifications from websites.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).not.toBeInTheDocument();
  });

  it('iPhone outside the installed app: shows the home-screen steps and why push needs them', async () => {
    Object.assign(browser, { supported: false, permission: 'unsupported', ios: true, iosNeedsInstall: true });
    renderSettings();
    await loaded();
    expect(screen.getByTestId('pwa-ios-steps')).toHaveTextContent('Add to Home Screen');
    expect(screen.getByTestId('push-ios-note')).toHaveTextContent('only work in the installed app');
  });

  it('not set up on this site: says so and hides enable and test', async () => {
    browser.configured = false;
    renderSettings();
    await loaded();
    expect(screen.getByTestId('push-not-configured')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send a test notification' })).not.toBeInTheDocument();
  });

  it('offers the browser install dialog when the browser allows it, and says when installed', async () => {
    const prompt = vi.fn(async () => undefined);
    setDeferredInstallPromptForTest({ prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) } as unknown as BeforeInstallPromptEvent);
    renderSettings();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Install app' }));
    await waitFor(() => expect(prompt).toHaveBeenCalled());
    expect(await screen.findByTestId('pwa-installed')).toBeInTheDocument();
  });
});
