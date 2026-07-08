import { describe, expect, it, vi } from 'vitest';
import { InvalidRetryBackoffConfigError, runWithRetryBackoff } from './retry';

function noopSleep(): Promise<void> {
  return Promise.resolve();
}

describe('runWithRetryBackoff', () => {
  it('resolves on the first attempt when fn succeeds immediately', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const { result, attempts } = await runWithRetryBackoff(fn, { maxAttempts: 3, baseDelayMs: 10, sleep: noopSleep });
    expect(result).toBe('ok');
    expect(attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on a thrown error and succeeds once fn stops failing', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient 1'))
      .mockRejectedValueOnce(new Error('transient 2'))
      .mockResolvedValueOnce('ok');
    const { result, attempts } = await runWithRetryBackoff(fn, { maxAttempts: 3, baseDelayMs: 10, sleep: noopSleep });
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('rethrows the last attempt\'s own error once every attempt is exhausted', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockRejectedValueOnce(new Error('final'));
    await expect(runWithRetryBackoff(fn, { maxAttempts: 3, baseDelayMs: 10, sleep: noopSleep })).rejects.toThrow('final');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('passes the current attempt number to fn', async () => {
    const seen: number[] = [];
    const fn = vi.fn().mockImplementation(async (attempt: number) => {
      seen.push(attempt);
      if (attempt < 2) {
        throw new Error('not yet');
      }
      return 'done';
    });
    await runWithRetryBackoff(fn, { maxAttempts: 3, baseDelayMs: 10, sleep: noopSleep });
    expect(seen).toEqual([1, 2]);
  });

  it('sleeps with exponentially increasing delays between attempts', async () => {
    const delays: number[] = [];
    const sleep = vi.fn().mockImplementation(async (ms: number) => {
      delays.push(ms);
    });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValueOnce('ok');
    await runWithRetryBackoff(fn, { maxAttempts: 3, baseDelayMs: 100, factor: 2, sleep });
    expect(delays).toEqual([100, 200]);
  });

  it('never sleeps when maxAttempts is 1', async () => {
    const sleep = vi.fn();
    const fn = vi.fn().mockResolvedValue('ok');
    await runWithRetryBackoff(fn, { maxAttempts: 1, baseDelayMs: 100, sleep });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('rejects an invalid maxAttempts', async () => {
    await expect(runWithRetryBackoff(vi.fn(), { maxAttempts: 0, baseDelayMs: 10 })).rejects.toBeInstanceOf(
      InvalidRetryBackoffConfigError,
    );
  });

  it('rejects a negative baseDelayMs', async () => {
    await expect(runWithRetryBackoff(vi.fn(), { maxAttempts: 2, baseDelayMs: -1 })).rejects.toBeInstanceOf(
      InvalidRetryBackoffConfigError,
    );
  });
});
