import { describe, expect, it } from 'vitest';
import { isTvDisplayStale, minutesSinceLastUpdate, TV_STALE_AFTER_MISSED_POLLS } from './tv-staleness';

const POLL = 90_000;
const NOW = Date.parse('2026-09-18T12:00:00.000Z');

describe('isTvDisplayStale', () => {
  it('is not stale while polls are landing', () => {
    expect(isTvDisplayStale(NOW - 1_000, NOW, POLL)).toBe(false);
    expect(isTvDisplayStale(NOW - POLL, NOW, POLL)).toBe(false);
  });

  /**
   * The tolerance exists so a wallboard never cries wolf over one flaky
   * request. A warning that shows up during normal operation is one the room
   * learns to ignore, which costs more than showing nothing (KAN-172).
   */
  it('tolerates exactly the configured number of missed polls, and no more', () => {
    const atLimit = NOW - POLL * (TV_STALE_AFTER_MISSED_POLLS + 1);
    expect(isTvDisplayStale(atLimit, NOW, POLL)).toBe(false);
    expect(isTvDisplayStale(atLimit - 1, NOW, POLL)).toBe(true);
  });

  /**
   * The case the whole change exists for: a TV that has not reached the server
   * in days looks exactly like a healthy one, because both fetch paths swallow
   * their errors and leave the last good data up.
   */
  it('is stale after a long outage', () => {
    expect(isTvDisplayStale(NOW - 24 * 60 * 60 * 1000, NOW, POLL)).toBe(true);
  });

  /**
   * Nothing has ever loaded, so the screen is already showing its own loading
   * state. Warning on top of that is noise, not information — and it would fire
   * on every TV for the first few seconds of its life.
   */
  it('is not stale before anything has ever loaded', () => {
    expect(isTvDisplayStale(null, NOW, POLL)).toBe(false);
  });
});

describe('minutesSinceLastUpdate', () => {
  it('reports whole minutes, rounded down so it never overstates staleness', () => {
    expect(minutesSinceLastUpdate(NOW - 59_000, NOW)).toBe(0);
    expect(minutesSinceLastUpdate(NOW - 60_000, NOW)).toBe(1);
    expect(minutesSinceLastUpdate(NOW - 119_000, NOW)).toBe(1);
  });

  /** A clock that jumped backwards (NTP correction on a TV left running for weeks) must not render a negative age. */
  it('never returns a negative age', () => {
    expect(minutesSinceLastUpdate(NOW + 60_000, NOW)).toBe(0);
  });
});
