import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { WarRoomWinOverlay } from './war-room-win-overlay';
import type { WinEventFeedItem } from '@/lib/orgs/win-rule-view';
import messages from '../../messages/en.json';

/** Mirrors `live-win-feed.test.tsx`'s own fake — jsdom has no native `EventSource`. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  private listeners: Record<string, Array<(event: MessageEvent<string>) => void>> = {};

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

function renderOverlay(reducedMotion = false): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WarRoomWinOverlay deviceToken="device-token-1" reducedMotion={reducedMotion} />
    </NextIntlClientProvider>,
  );
}

describe('WarRoomWinOverlay', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connects to the token-authenticated feed endpoint and renders nothing until a win arrives', () => {
    renderOverlay();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe('/api/tv-pairing/win-feed?token=device-token-1');
    expect(screen.queryByText('New win!')).not.toBeInTheDocument();
  });

  it('shows a toast and confetti when a win arrives, then clears itself', () => {
    renderOverlay();
    const source = FakeEventSource.instances[0];
    act(() => {
      source.emitWin(item);
    });
    expect(screen.getByText('New win!')).toBeInTheDocument();
    expect(screen.getByText('Big order — order_completed (ord_9001)')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4500);
    });
    expect(screen.queryByText('New win!')).not.toBeInTheDocument();
  });

  it('replaces an in-progress celebration when a second win arrives before the first clears', () => {
    renderOverlay();
    const source = FakeEventSource.instances[0];
    act(() => {
      source.emitWin(item);
    });
    act(() => {
      vi.advanceTimersByTime(2000);
      source.emitWin({ ...item, id: 'win-2', winRuleName: 'Trial converted', winType: 'trial_conversion' });
    });
    expect(screen.getByText('Trial converted — order_completed (ord_9001)')).toBeInTheDocument();

    // Only 4500ms since the *second* win, not the first, should still be showing it.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('Trial converted — order_completed (ord_9001)')).toBeInTheDocument();
  });

  it('closes the connection and clears its timer on unmount, leaking neither', () => {
    const { unmount } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <WarRoomWinOverlay deviceToken="device-token-1" reducedMotion={false} />
      </NextIntlClientProvider>,
    );
    const source = FakeEventSource.instances[0];
    act(() => {
      source.emitWin(item);
    });
    unmount();
    expect(source.closed).toBe(true);
    // Advancing timers after unmount must not throw (no dangling setState on an unmounted component).
    expect(() => vi.advanceTimersByTime(10000)).not.toThrow();
  });
});
