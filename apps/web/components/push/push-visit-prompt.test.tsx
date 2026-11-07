import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../messages/en.json';

const browser = vi.hoisted(() => ({
  supported: true,
  permission: 'default' as 'default' | 'granted' | 'denied' | 'unsupported',
  iosNeedsInstall: false,
  configured: true,
  subscription: null as { endpoint: string } | null,
}));

const client = vi.hoisted(() => ({
  subscribeThisDevice: vi.fn(),
  saveSubscriptionOnServer: vi.fn(),
}));

vi.mock('@/lib/push/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/push/client')>();
  return {
    ...actual,
    isPushSupported: () => browser.supported,
    notificationPermission: () => browser.permission,
    needsIosInstallForPush: () => browser.iosNeedsInstall,
    fetchPushConfig: async () => ({ configured: browser.configured, publicKey: browser.configured ? 'pub-key' : null }),
    currentSubscription: async () => browser.subscription,
    subscribeThisDevice: client.subscribeThisDevice,
    saveSubscriptionOnServer: client.saveSubscriptionOnServer,
  };
});

import { PushVisitPrompt } from './push-visit-prompt';

const requestPermission = vi.fn();

function renderPrompt(signedIn = true) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PushVisitPrompt signedIn={signedIn} />
    </NextIntlClientProvider>,
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  Object.assign(browser, { supported: true, permission: 'default', iosNeedsInstall: false, configured: true, subscription: null });
  client.subscribeThisDevice.mockReset().mockResolvedValue({ endpoint: 'https://push.example/x' });
  client.saveSubscriptionOnServer.mockReset().mockResolvedValue(true);
  requestPermission.mockReset();
  vi.stubGlobal('Notification', { requestPermission, permission: 'default' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('PushVisitPrompt', () => {
  it('asks a signed-in person whose browser was never asked, without opening the browser dialog', async () => {
    renderPrompt();
    expect(await screen.findByRole('region', { name: 'Turn on notifications' })).toHaveTextContent('Turn on notifications?');
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('asks the browser only on the click, then subscribes this device in the page language', async () => {
    requestPermission.mockResolvedValue('granted');
    renderPrompt();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(client.subscribeThisDevice).toHaveBeenCalledWith('pub-key', 'en'));
    expect(requestPermission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId('push-visit-prompt')).not.toBeInTheDocument());
  });

  it('"Not now" hides it for the rest of this visit only', async () => {
    const first = renderPrompt();
    fireEvent.click(await screen.findByRole('button', { name: 'Not now', exact: true }));
    expect(screen.queryByTestId('push-visit-prompt')).not.toBeInTheDocument();
    first.unmount();
    renderPrompt();
    await settle();
    expect(screen.queryByTestId('push-visit-prompt')).not.toBeInTheDocument();
    window.sessionStorage.clear();
    renderPrompt();
    expect(await screen.findByTestId('push-visit-prompt')).toBeInTheDocument();
  });

  it('stays hidden when signed out, not set up, blocked, unsupported or turned off on this device', async () => {
    renderPrompt(false);
    await settle();
    expect(screen.queryByTestId('push-visit-prompt')).not.toBeInTheDocument();

    for (const setup of [{ configured: false }, { permission: 'denied' as const }, { supported: false, permission: 'unsupported' as const }]) {
      Object.assign(browser, { supported: true, permission: 'default', configured: true }, setup);
      const view = renderPrompt();
      await settle();
      expect(screen.queryByTestId('push-visit-prompt')).not.toBeInTheDocument();
      view.unmount();
    }

    Object.assign(browser, { supported: true, permission: 'default', configured: true });
    window.localStorage.setItem('growthos.push.deviceOff', '1');
    renderPrompt();
    await settle();
    expect(screen.queryByTestId('push-visit-prompt')).not.toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('quietly re-subscribes a device that is allowed but has no subscription', async () => {
    browser.permission = 'granted';
    renderPrompt();
    await waitFor(() => expect(client.subscribeThisDevice).toHaveBeenCalledWith('pub-key', 'en'));
    expect(screen.queryByTestId('push-visit-prompt')).not.toBeInTheDocument();
  });

  it('re-sends an existing subscription once per session, for whoever is signed in', async () => {
    browser.permission = 'granted';
    browser.subscription = { endpoint: 'https://push.example/existing' };
    const view = renderPrompt();
    await waitFor(() => expect(client.saveSubscriptionOnServer).toHaveBeenCalledTimes(1));
    view.unmount();
    renderPrompt();
    await settle();
    expect(client.saveSubscriptionOnServer).toHaveBeenCalledTimes(1);
    expect(client.subscribeThisDevice).not.toHaveBeenCalled();
  });

  it('on an iPhone outside the installed app, explains adding it to the home screen instead', async () => {
    Object.assign(browser, { supported: false, permission: 'unsupported', iosNeedsInstall: true });
    renderPrompt();
    const prompt = await screen.findByTestId('push-visit-prompt');
    expect(prompt).toHaveTextContent('Notifications on your iPhone');
    expect(prompt).toHaveTextContent('Add to Home Screen');
    expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument();
  });
});
