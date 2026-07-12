import { describe, expect, it } from 'vitest';
import { toTvPairingSummaryView } from './tv-pairing-view';

function fakePairing(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pairing-1',
    label: 'Office lobby',
    board_ids: ['board-1', 'board-2'],
    rotation_seconds: 45,
    reduced_motion: true,
    claimed_at: '2026-07-12T00:00:00.000Z',
    last_seen_at: undefined,
    session_expires_at: undefined,
    revoked_at: undefined,
    ...overrides,
  } as unknown as Parameters<typeof toTvPairingSummaryView>[0];
}

describe('toTvPairingSummaryView', () => {
  it('maps every field for a live, recently-seen pairing', () => {
    const view = toTvPairingSummaryView(
      fakePairing({ last_seen_at: '2026-07-12T01:00:00.000Z', session_expires_at: '2026-07-14T00:00:00.000Z' }),
    );
    expect(view).toEqual({
      id: 'pairing-1',
      label: 'Office lobby',
      boardIds: ['board-1', 'board-2'],
      rotationSeconds: 45,
      reducedMotion: true,
      claimedAt: '2026-07-12T00:00:00.000Z',
      lastSeenAt: '2026-07-12T01:00:00.000Z',
      sessionExpiresAt: '2026-07-14T00:00:00.000Z',
    });
  });

  it('omits lastSeenAt/sessionExpiresAt/revokedAt keys entirely when unset, rather than including them as undefined', () => {
    const view = toTvPairingSummaryView(fakePairing());
    expect('lastSeenAt' in view).toBe(false);
    expect('sessionExpiresAt' in view).toBe(false);
    expect('revokedAt' in view).toBe(false);
  });

  it('includes revokedAt for a revoked pairing', () => {
    const view = toTvPairingSummaryView(fakePairing({ revoked_at: '2026-07-13T00:00:00.000Z' }));
    expect(view.revokedAt).toBe('2026-07-13T00:00:00.000Z');
  });
});
