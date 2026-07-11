import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { LiveWinFeed } from './live-win-feed';
import type { WinEventFeedItem } from '@/lib/orgs/win-rule-view';
import messages from '../../messages/en.json';

/** jsdom has no native `EventSource` — a minimal fake standing in for the browser's, capturing listeners so a test can fire `open`/`win` events by hand. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners: Record<string, Array<(event: MessageEvent<string>) => void>> = {};
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    (this.listeners[type] ??= []).push(listener);
  }

  close(): void {
    this.closed = true;
  }

  emitWin(item: WinEventFeedItem): void {
    const event = { data: JSON.stringify(item) } as MessageEvent<string>;
    this.listeners.win?.forEach((listener) => listener(event));
  }
}

function renderFeed(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LiveWinFeed orgId="org-1" projectId="project-1" />
    </NextIntlClientProvider>,
  );
}

const item: WinEventFeedItem = {
  id: 'win-1',
  winRuleName: 'Big order',
  winType: 'generic',
  schemaName: 'order_completed',
  clientId: 'ord_9001',
  payload: {},
  occurredAt: '2026-07-11T00:00:00.000Z',
  createdAt: '2026-07-11T00:00:00.000Z',
};

describe('LiveWinFeed', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  it('connects to the project-scoped feed endpoint and shows an empty state', () => {
    renderFeed();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe('/api/orgs/org-1/projects/project-1/win-rules/feed');
    expect(screen.getByText("No wins yet. They'll appear here in real time.")).toBeInTheDocument();
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
  });

  it('shows connected once the stream opens', () => {
    renderFeed();
    const source = FakeEventSource.instances[0];
    act(() => {
      source.onopen?.();
    });
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('renders a win pushed over the stream', () => {
    renderFeed();
    const source = FakeEventSource.instances[0];
    act(() => {
      source.emitWin(item);
    });
    expect(screen.getByText('Big order — order_completed (ord_9001)')).toBeInTheDocument();
    expect(screen.queryByText('Reactivation')).not.toBeInTheDocument();
  });

  it('shows a win-type badge for a KAN-66 catalog type, but not for generic', () => {
    renderFeed();
    const source = FakeEventSource.instances[0];
    act(() => {
      source.emitWin({ ...item, winType: 'trial_conversion' });
    });
    expect(screen.getByText('Trial conversion')).toBeInTheDocument();
  });

  it('closes the connection on unmount', () => {
    const { unmount } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LiveWinFeed orgId="org-1" projectId="project-1" />
      </NextIntlClientProvider>,
    );
    const source = FakeEventSource.instances[0];
    unmount();
    expect(source.closed).toBe(true);
  });
});
