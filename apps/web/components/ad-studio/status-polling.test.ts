import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startStatusPolling } from './status-polling';

describe('startStatusPolling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('never runs two status calls at once, however slow one is', async () => {
    let running = 0;
    let most = 0;
    let calls = 0;
    const resolvers: (() => void)[] = [];
    const refresh = () => {
      calls += 1;
      running += 1;
      most = Math.max(most, running);
      return new Promise<void>((resolve) => resolvers.push(() => {
        running -= 1;
        resolve();
      }));
    };
    const stop = startStatusPolling(refresh, 4000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(calls).toBe(1);
    // The call hangs for 30 s: a fixed interval would have fired seven more meanwhile.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toBe(1);
    resolvers.shift()!();
    await vi.advanceTimersByTimeAsync(4000);
    expect(calls).toBe(2);
    expect(most).toBe(1);
    stop();
  });

  it('keeps polling after a failed call, ticks the clock, and stops cleanly', async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const tick = vi.fn();
    const stop = startStatusPolling(refresh, 1000, tick);
    await vi.advanceTimersByTimeAsync(3100);
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(tick).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(tick).toHaveBeenCalledTimes(3);
  });
});
