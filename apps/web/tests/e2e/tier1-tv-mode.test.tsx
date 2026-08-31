import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { screen, act } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from './helpers/test-harness';
import { TvPairingScreen } from '@/components/tv/tv-pairing-screen';
import { TvRotationScreen } from '@/components/tv/tv-rotation-screen';
import { WarRoomWinOverlay } from '@/components/tv/war-room-win-overlay';
import { ConfettiBurst } from '@/components/tv/confetti-burst';
import type { TvRotationManifest, TvBoardFrame } from '@/lib/tv/tv-client';
import * as tvClient from '@/lib/tv/tv-client';
import enMessages from '@/messages/en.json';

// Mock audio chime
vi.mock('@/lib/tv/win-chime', () => ({
  playWinChime: vi.fn(),
}));

let mockEventListeners: Record<string, ((event: any) => void)[]> = {};

class MockEventSource {
  static CLOSED = 2;
  readyState = 1;

  constructor(public url: string) {
    mockEventListeners = {};
  }

  addEventListener(type: string, listener: any) {
    if (!mockEventListeners[type]) {
      mockEventListeners[type] = [];
    }
    mockEventListeners[type].push(listener);
  }

  removeEventListener(type: string, listener: any) {
    if (mockEventListeners[type]) {
      mockEventListeners[type] = mockEventListeners[type].filter((l) => l !== listener);
    }
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }
}

const EMPTY_LEADERBOARD = {
  periodStart: '2026-01-05',
  periodEnd: '2026-01-11',
  rows: [],
  unattributedTotal: 0,
  unattributedCount: 0,
};

describe('Tier 1: High-Impact TV Billboard & War Room Display Mode (R2.6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('8.1 TvPairingScreen: displays TV pairing code in large, accessible typography with clear pairing instructions', () => {
    renderWithIntl(<TvPairingScreen code="GROWTH-8821" />);

    expect(screen.getByText('GROWTH-8821')).toBeInTheDocument();
    expect(screen.getByText(enMessages.TvMode.pairingHeading)).toBeInTheDocument();
    expect(screen.getByText(enMessages.TvMode.pairingInstructions)).toBeInTheDocument();
  });

  it('8.2 ConfettiBurst: renders celebratory particles and respects reducedMotion setting', () => {
    const { container, rerender } = renderWithIntl(<ConfettiBurst reducedMotion={false} />);
    const particles = container.querySelectorAll('span.animate-confetti-fall');
    expect(particles.length).toBe(48);

    // When reducedMotion is true, particles are suppressed and replaced by gentle pulse
    rerender(<ConfettiBurst reducedMotion={true} />);
    const reducedParticles = container.querySelectorAll('span.animate-confetti-fall');
    expect(reducedParticles.length).toBe(0);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('8.3 TvRotationScreen: renders TV header with rotation manifest label and board frame content', async () => {
    const mockBoardFrame: TvBoardFrame = {
      id: 'b1',
      name: 'Executive Revenue Board',
      tiles: [
        {
          tile: {
            id: 'tile-1',
            title: 'Q3 Enterprise Pipeline',
            type: 'big_number',
            layout: { w: 2, h: 2, x: 0, y: 0 },
            metricNames: ['m1'],
            dimensions: [],
          },
          view: { kind: 'big_number', value: 1450000, isEmpty: false, freshness: null },
        },
      ],
    };

    vi.spyOn(tvClient, 'fetchTvBoardFrame').mockResolvedValue(mockBoardFrame);

    const mockManifest: TvRotationManifest = {
      label: 'HQ War Room Billboard',
      rotationSeconds: 15,
      reducedMotion: false,
      organizationId: 'org-1',
      projectId: 'proj-1',
      boards: [{ id: 'b1', name: 'Executive Revenue Board' }],
      goals: [],
      repCollectionLeaderboard: EMPTY_LEADERBOARD,
    };

    await act(async () => {
      renderWithIntl(<TvRotationScreen deviceToken="tv-token-123" manifest={mockManifest} />);
    });

    expect(screen.getByText('HQ War Room Billboard')).toBeInTheDocument();
    expect(screen.getByText('Executive Revenue Board')).toBeInTheDocument();
  });

  it('8.4 TvRotationScreen: cycles automatically between boards, goals, and leaderboards according to rotationSeconds', async () => {
    const mockManifest: TvRotationManifest = {
      label: 'Growth Billboard',
      rotationSeconds: 10,
      reducedMotion: false,
      organizationId: 'org-1',
      projectId: 'proj-1',
      boards: [
        { id: 'b1', name: 'Main Sales Board' },
        { id: 'b2', name: 'Funnel Metrics Board' },
      ],
      goals: [
        {
          id: 'goal-1',
          name: 'Annual ARR Target',
          metricName: 'arr',
          deadline: '2026-12-31',
          thermometer: {
            kind: 'ok',
            status: 'on_track',
            statusColor: 'green',
            percentFilled: 75,
            actualValue: 750000,
            expectedAtNow: 700000,
            projectedFinalValue: 1000000,
            isGoalMet: false,
          },
        },
      ],
      repCollectionLeaderboard: {
        periodStart: '2026-01-05',
        periodEnd: '2026-01-11',
        rows: [{ orgPersonId: 'p1', name: 'Sarah Connor', totalAmount: 50000, entryCount: 12 }],
        unattributedTotal: 0,
        unattributedCount: 0,
      },
    };

    vi.spyOn(tvClient, 'fetchTvBoardFrame').mockResolvedValue({ id: 'b1', name: 'Main Sales Board', tiles: [] });

    await act(async () => {
      renderWithIntl(<TvRotationScreen deviceToken="tv-token-123" manifest={mockManifest} />);
    });

    // Initial frame: Board 1
    expect(screen.getByText('Main Sales Board')).toBeInTheDocument();

    // Advance 10 seconds -> Board 2
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.getByText('Funnel Metrics Board')).toBeInTheDocument();

    // Advance 10 seconds -> Goals Frame
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.getByText(enMessages.TvMode.goalsFrameHeading)).toBeInTheDocument();
    expect(screen.getByText('Annual ARR Target')).toBeInTheDocument();

    // Advance 10 seconds -> Leaderboard Frame
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.getByText(enMessages.TvMode.leaderboardFrameHeading)).toBeInTheDocument();
    expect(screen.getByText(/Sarah Connor/)).toBeInTheDocument();

    // Advance 10 seconds -> Loops back to Board 1
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.getByText('Main Sales Board')).toBeInTheDocument();
  });

  it('8.5 WarRoomWinOverlay: handles live SSE win event and auto-clears celebration toast after duration', async () => {
    renderWithIntl(<WarRoomWinOverlay deviceToken="tv-token-123" reducedMotion={false} />);

    // Initially no win overlay visible
    expect(screen.queryByText(enMessages.TvMode.winOverlayHeading)).not.toBeInTheDocument();

    // Simulate SSE win event arrival with valid winType
    await act(async () => {
      const listeners = mockEventListeners['win'] ?? [];
      for (const listener of listeners) {
        listener({
          data: JSON.stringify({
            winRuleName: 'Enterprise Deal Closed',
            schemaName: 'HubSpot Deals',
            clientId: 'client-999',
            winType: 'trial_conversion',
          }),
        });
      }
    });

    // Win overlay is displayed
    expect(screen.getByText(enMessages.TvMode.winOverlayHeading)).toBeInTheDocument();
    expect(screen.getByText(/Enterprise Deal Closed/)).toBeInTheDocument();
    expect(screen.getByText(enMessages.WinRules.winTypeLabel.trial_conversion)).toBeInTheDocument();

    // Advance timers by 4.5s celebration duration
    await act(async () => {
      vi.advanceTimersByTime(4500);
    });

    // Win overlay clears cleanly
    expect(screen.queryByText(enMessages.TvMode.winOverlayHeading)).not.toBeInTheDocument();
  });

  it('8.6 TvRotationScreen: handles zero frames or empty manifest gracefully without crashing', () => {
    const emptyManifest: TvRotationManifest = {
      label: 'Empty TV',
      rotationSeconds: 10,
      reducedMotion: false,
      organizationId: 'org-1',
      projectId: 'proj-1',
      boards: [],
      goals: [],
      repCollectionLeaderboard: EMPTY_LEADERBOARD,
    };

    renderWithIntl(<TvRotationScreen deviceToken="tv-token-123" manifest={emptyManifest} />);
    expect(screen.getByText(enMessages.TvMode.noFrames)).toBeInTheDocument();
  });
});
