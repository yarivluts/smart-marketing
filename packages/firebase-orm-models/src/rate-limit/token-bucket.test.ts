import { describe, expect, it } from 'vitest';
import { InMemoryTokenBucketRateLimiter, InvalidTokenBucketConfigError } from './token-bucket';

function fakeClock(startMs: number) {
  let nowMs = startMs;
  return {
    now: () => nowMs,
    advanceSeconds: (seconds: number) => {
      nowMs += seconds * 1000;
    },
  };
}

describe('InMemoryTokenBucketRateLimiter', () => {
  it('allows requests up to capacity, then rejects with a positive retryAfterSeconds', () => {
    const clock = fakeClock(0);
    const limiter = new InMemoryTokenBucketRateLimiter({ capacity: 3, refillPerSecond: 1, now: clock.now });

    expect(limiter.consume('key-a')).toEqual({ allowed: true, remaining: 2, retryAfterSeconds: 0 });
    expect(limiter.consume('key-a')).toEqual({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
    expect(limiter.consume('key-a')).toEqual({ allowed: true, remaining: 0, retryAfterSeconds: 0 });

    const rejected = limiter.consume('key-a');
    expect(rejected.allowed).toBe(false);
    expect(rejected.remaining).toBe(0);
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('refills over time and eventually allows another request', () => {
    const clock = fakeClock(0);
    const limiter = new InMemoryTokenBucketRateLimiter({ capacity: 1, refillPerSecond: 1, now: clock.now });

    expect(limiter.consume('key-a').allowed).toBe(true);
    expect(limiter.consume('key-a').allowed).toBe(false);

    clock.advanceSeconds(1);
    expect(limiter.consume('key-a').allowed).toBe(true);
  });

  it('never refills past capacity even after a long idle gap', () => {
    const clock = fakeClock(0);
    const limiter = new InMemoryTokenBucketRateLimiter({ capacity: 2, refillPerSecond: 100, now: clock.now });

    limiter.consume('key-a');
    clock.advanceSeconds(1000);
    const result = limiter.consume('key-a');
    // A 1000-second gap would refill far past capacity if uncapped (100k tokens) — it must cap at 2,
    // so this second consume (spending 1) leaves exactly 1, not some huge number.
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it('tracks separate keys independently', () => {
    const clock = fakeClock(0);
    const limiter = new InMemoryTokenBucketRateLimiter({ capacity: 1, refillPerSecond: 1, now: clock.now });

    expect(limiter.consume('key-a').allowed).toBe(true);
    expect(limiter.consume('key-a').allowed).toBe(false);
    // A different key has its own untouched bucket.
    expect(limiter.consume('key-b').allowed).toBe(true);
  });

  it('reports a Retry-After that, once elapsed, actually admits the request', () => {
    const clock = fakeClock(0);
    const limiter = new InMemoryTokenBucketRateLimiter({ capacity: 1, refillPerSecond: 2, now: clock.now });

    limiter.consume('key-a');
    const rejected = limiter.consume('key-a');
    expect(rejected.allowed).toBe(false);

    clock.advanceSeconds(rejected.retryAfterSeconds);
    expect(limiter.consume('key-a').allowed).toBe(true);
  });

  it('rejects a non-positive capacity or refill rate', () => {
    expect(() => new InMemoryTokenBucketRateLimiter({ capacity: 0, refillPerSecond: 1 })).toThrow(InvalidTokenBucketConfigError);
    expect(() => new InMemoryTokenBucketRateLimiter({ capacity: 1, refillPerSecond: 0 })).toThrow(InvalidTokenBucketConfigError);
    expect(() => new InMemoryTokenBucketRateLimiter({ capacity: -1, refillPerSecond: 1 })).toThrow(InvalidTokenBucketConfigError);
  });

  it('supports spending more than one token per call via the cost parameter', () => {
    const clock = fakeClock(0);
    const limiter = new InMemoryTokenBucketRateLimiter({ capacity: 5, refillPerSecond: 1, now: clock.now });

    expect(limiter.consume('key-a', 3)).toEqual({ allowed: true, remaining: 2, retryAfterSeconds: 0 });
    const rejected = limiter.consume('key-a', 3);
    expect(rejected.allowed).toBe(false);
  });

  it('evicts the least-recently-used key once over the configured maxKeys, giving the evicted key a fresh bucket again', () => {
    const clock = fakeClock(0);
    const limiter = new InMemoryTokenBucketRateLimiter({ capacity: 1, refillPerSecond: 1, now: clock.now, maxKeys: 2 });

    expect(limiter.consume('key-a').allowed).toBe(true); // key-a's bucket is now empty (0 tokens).
    expect(limiter.consume('key-b').allowed).toBe(true); // key-b's bucket is now empty too; key-a is now least-recently-used.
    expect(limiter.consume('key-a').allowed).toBe(false); // reading key-a's still-empty bucket also makes it most-recently-used again.
    expect(limiter.consume('key-c').allowed).toBe(true); // key-b is now least-recently-used -> evicted; key-c gets a fresh bucket.

    // key-b was evicted, so it gets a brand-new full bucket rather than reusing its emptied one.
    expect(limiter.consume('key-b').allowed).toBe(true);
  });
});
