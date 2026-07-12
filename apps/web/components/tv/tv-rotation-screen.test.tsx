import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { TvRotationScreen } from './tv-rotation-screen';
import type { TvBoardFrame, TvRotationManifest } from '@/lib/tv/tv-client';
import { fetchTvBoardFrame } from '@/lib/tv/tv-client';
import messages from '../../messages/en.json';

vi.mock('@/lib/tv/tv-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tv/tv-client')>();
  return { ...actual, fetchTvBoardFrame: vi.fn() };
});

/** `TvRotationScreen` always renders `WarRoomWinOverlay`, which opens an `EventSource` — jsdom has no native implementation. */
class FakeEventSource {
  addEventListener(): void {}
  close(): void {}
}

const BOARD_FRAME_A: TvBoardFrame = {
  id: 'board-1',
  name: 'Marketing',
  tiles: [{ tile: { id: 'tile-1', type: 'big_number', title: 'Signups', layout: { x: 0, y: 0, w: 3, h: 2 }, metricNames: ['signups'], dimensions: [] }, view: { kind: 'big_number', value: 42 } }],
};

const BOARD_FRAME_B: TvBoardFrame = {
  id: 'board-2',
  name: 'Revenue',
  tiles: [{ tile: { id: 'tile-2', type: 'big_number', title: 'MRR', layout: { x: 0, y: 0, w: 3, h: 2 }, metricNames: ['mrr'], dimensions: [] }, view: { kind: 'big_number', value: 1000 } }],
};

function manifestWith(overrides: Partial<TvRotationManifest>): TvRotationManifest {
  return {
    label: 'Office lobby',
    rotationSeconds: 10,
    reducedMotion: false,
    organizationId: 'org-1',
    projectId: 'project-1',
    boards: [{ id: 'board-1', name: 'Marketing' }],
    goals: [],
    ...overrides,
  };
}

function renderScreen(manifest: TvRotationManifest): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TvRotationScreen deviceToken="device-token-1" manifest={manifest} />
    </NextIntlClientProvider>,
  );
}

/** Flushes pending microtasks (a mocked fetch's own promise resolution plus React's resulting state update) without relying on `@testing-library/react`'s `waitFor` — `waitFor` polls via real timers internally, which never fire once `vi.useFakeTimers()` is active, so it would just hang until the test's own real-wall-clock timeout. */
async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('TvRotationScreen (KAN-67)', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.useFakeTimers();
    vi.mocked(fetchTvBoardFrame).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fetches and renders the current board frame', async () => {
    vi.mocked(fetchTvBoardFrame).mockResolvedValue(BOARD_FRAME_A);
    renderScreen(manifestWith({}));
    await flushMicrotasks();

    expect(screen.getByText('Signups')).toBeInTheDocument();
    expect(fetchTvBoardFrame).toHaveBeenCalledWith('device-token-1', 'board-1');
  });

  it('rotates to the next board after rotationSeconds and fetches its data', async () => {
    vi.mocked(fetchTvBoardFrame).mockResolvedValueOnce(BOARD_FRAME_A).mockResolvedValueOnce(BOARD_FRAME_B);
    renderScreen(manifestWith({ boards: [{ id: 'board-1', name: 'Marketing' }, { id: 'board-2', name: 'Revenue' }] }));
    await flushMicrotasks();
    expect(screen.getByText('Signups')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    await flushMicrotasks();

    expect(screen.getByText('MRR')).toBeInTheDocument();
    expect(fetchTvBoardFrame).toHaveBeenCalledWith('device-token-1', 'board-2');
  });

  it('a single-board TV (no goals) retries automatically after a failed fetch, instead of staying stuck on "loading" forever', async () => {
    vi.mocked(fetchTvBoardFrame).mockRejectedValueOnce(new Error('network blip')).mockResolvedValueOnce(BOARD_FRAME_A);
    renderScreen(manifestWith({}));
    await flushMicrotasks();

    expect(fetchTvBoardFrame).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Loading board…')).toBeInTheDocument();

    // The rotation timer still ticks even with only one frame — this is the
    // regression this test guards: without a periodic retry, a TV paired to
    // a single board (a common configuration) would never re-attempt a
    // failed fetch, since the frame's own identity never changes.
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    await flushMicrotasks();

    expect(fetchTvBoardFrame).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Signups')).toBeInTheDocument();
  });

  it('refreshing the same board on a later rotation tick does not flash back to the loading state', async () => {
    vi.mocked(fetchTvBoardFrame).mockResolvedValue(BOARD_FRAME_A);
    renderScreen(manifestWith({}));
    await flushMicrotasks();
    expect(screen.getByText('Signups')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    await flushMicrotasks();

    // Still showing the (re-fetched, same) tile the whole time — never fell
    // back through the `null` "Loading board…" placeholder in between.
    expect(screen.getByText('Signups')).toBeInTheDocument();
    expect(screen.queryByText('Loading board…')).not.toBeInTheDocument();
    expect(fetchTvBoardFrame).toHaveBeenCalledTimes(2);
  });

  it('renders a goals frame with the goal thermometer', () => {
    renderScreen(
      manifestWith({
        boards: [],
        goals: [
          {
            id: 'goal-1',
            name: 'Q4 signups',
            metricName: 'signups',
            deadline: '2026-12-31',
            thermometer: { kind: 'warehouse_not_configured' },
          },
        ],
      }),
    );

    expect(screen.getByText('Q4 signups')).toBeInTheDocument();
  });

  it('shows the empty state when there are no boards and no goals', () => {
    renderScreen(manifestWith({ boards: [], goals: [] }));
    expect(screen.getByText('This TV has no boards or goals to show yet.')).toBeInTheDocument();
  });
});
