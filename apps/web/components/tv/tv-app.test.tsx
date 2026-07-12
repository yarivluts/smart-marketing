import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { TvApp } from './tv-app';
import messages from '../../messages/en.json';

const PENDING_POLL_INTERVAL_MS = 4000;

/** Mirrors `war-room-win-overlay.test.tsx`'s own fake — every claimed frame renders `WarRoomWinOverlay`, which always opens one. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(): void {}
  close(): void {
    this.closed = true;
  }
}

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

function renderApp(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TvApp />
    </NextIntlClientProvider>,
  );
}

describe('TvApp', () => {
  beforeEach(() => {
    window.localStorage.clear();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('mints a pairing and shows the code while waiting to be claimed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/tv-pairing') {
          return jsonResponse({ deviceToken: 'dev-token-1', code: 'AB12CD', codeExpiresAt: '2026-07-12T01:00:00.000Z' });
        }
        if (url.startsWith('/api/tv-pairing/status')) {
          return jsonResponse({ status: 'pending', codeExpiresAt: '2026-07-12T01:00:00.000Z' });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    renderApp();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('AB12CD')).toBeInTheDocument();
    expect(window.localStorage.getItem('growthos-tv-device-token')).toBeNull();
  });

  it('transitions to the rotation screen once an admin claims the pairing', async () => {
    let claimed = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/tv-pairing') {
          return jsonResponse({ deviceToken: 'dev-token-2', code: 'ZZ9999', codeExpiresAt: '2026-07-12T01:00:00.000Z' });
        }
        if (url.startsWith('/api/tv-pairing/status')) {
          return jsonResponse(
            claimed
              ? {
                  status: 'claimed',
                  organizationId: 'org-1',
                  projectId: 'project-1',
                  boardIds: [],
                  rotationSeconds: 30,
                  reducedMotion: false,
                  label: 'Office lobby',
                }
              : { status: 'pending', codeExpiresAt: '2026-07-12T01:00:00.000Z' },
          );
        }
        if (url.startsWith('/api/tv-pairing/rotation')) {
          return jsonResponse({
            label: 'Office lobby',
            rotationSeconds: 30,
            reducedMotion: false,
            organizationId: 'org-1',
            projectId: 'project-1',
            boards: [],
            goals: [],
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    renderApp();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('ZZ9999')).toBeInTheDocument();

    claimed = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_POLL_INTERVAL_MS);
    });

    expect(screen.getByText('This TV has no boards or goals to show yet.')).toBeInTheDocument();
    expect(window.localStorage.getItem('growthos-tv-device-token')).toBe('dev-token-2');
  });

  it('resumes an already-claimed pairing from localStorage without minting a new one', async () => {
    window.localStorage.setItem('growthos-tv-device-token', 'stored-token');
    const mintFetch = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/tv-pairing') {
          mintFetch();
          return jsonResponse({ deviceToken: 'should-not-be-used', code: 'SHOULD', codeExpiresAt: '2026-07-12T01:00:00.000Z' });
        }
        if (url.startsWith('/api/tv-pairing/status')) {
          return jsonResponse({
            status: 'claimed',
            organizationId: 'org-1',
            projectId: 'project-1',
            boardIds: [],
            rotationSeconds: 30,
            reducedMotion: false,
            label: 'Resumed TV',
          });
        }
        if (url.startsWith('/api/tv-pairing/rotation')) {
          return jsonResponse({
            label: 'Resumed TV',
            rotationSeconds: 30,
            reducedMotion: false,
            organizationId: 'org-1',
            projectId: 'project-1',
            boards: [],
            goals: [],
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    renderApp();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mintFetch).not.toHaveBeenCalled();
    expect(screen.getByText('This TV has no boards or goals to show yet.')).toBeInTheDocument();
  });

  it('mints a fresh pairing after the stored one is revoked', async () => {
    window.localStorage.setItem('growthos-tv-device-token', 'revoked-token');
    let statusCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/tv-pairing') {
          return jsonResponse({ deviceToken: 'dev-token-3', code: 'NEW999', codeExpiresAt: '2026-07-12T01:00:00.000Z' });
        }
        if (url.startsWith('/api/tv-pairing/status')) {
          statusCalls += 1;
          if (statusCalls === 1) {
            return jsonResponse({ status: 'revoked' });
          }
          return jsonResponse({ status: 'pending', codeExpiresAt: '2026-07-12T01:00:00.000Z' });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    renderApp();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(window.localStorage.getItem('growthos-tv-device-token')).toBeNull();
    expect(screen.getByText('NEW999')).toBeInTheDocument();
  });
});
