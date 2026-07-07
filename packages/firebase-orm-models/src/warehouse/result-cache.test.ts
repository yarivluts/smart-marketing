import { describe, expect, it } from 'vitest';
import { InMemoryMetricQueryResultCache } from './result-cache';
import type { WarehouseRow } from './query-executor';

function fakeClock(startMs: number) {
  let nowMs = startMs;
  return {
    now: () => nowMs,
    advanceSeconds: (seconds: number) => {
      nowMs += seconds * 1000;
    },
  };
}

const ROWS: WarehouseRow[] = [{ bucket_date: '2026-01-01', cac: 12.5 }];

describe('InMemoryMetricQueryResultCache', () => {
  it('returns undefined for a key that was never set', () => {
    const cache = new InMemoryMetricQueryResultCache();
    expect(cache.get('missing')).toBeUndefined();
  });

  it('returns a set value before its TTL elapses', () => {
    const clock = fakeClock(0);
    const cache = new InMemoryMetricQueryResultCache(clock.now);
    cache.set('key-a', ROWS, 60);
    clock.advanceSeconds(59);
    expect(cache.get('key-a')).toEqual(ROWS);
  });

  it('expires a value once its TTL has elapsed, and evicts it rather than returning stale data', () => {
    const clock = fakeClock(0);
    const cache = new InMemoryMetricQueryResultCache(clock.now);
    cache.set('key-a', ROWS, 60);
    clock.advanceSeconds(60);
    expect(cache.get('key-a')).toBeUndefined();
    // A second read after eviction must not resurrect it (proves it was deleted, not just skipped).
    expect(cache.get('key-a')).toBeUndefined();
  });

  it('tracks separate keys independently', () => {
    const cache = new InMemoryMetricQueryResultCache();
    cache.set('key-a', ROWS, 60);
    expect(cache.get('key-b')).toBeUndefined();
    expect(cache.get('key-a')).toEqual(ROWS);
  });

  it('overwrites an existing key with a fresh TTL', () => {
    const clock = fakeClock(0);
    const cache = new InMemoryMetricQueryResultCache(clock.now);
    cache.set('key-a', ROWS, 10);
    clock.advanceSeconds(5);
    const updatedRows: WarehouseRow[] = [{ bucket_date: '2026-01-02', cac: 13.1 }];
    cache.set('key-a', updatedRows, 10);
    clock.advanceSeconds(6);
    // Still within the fresh 10s window from the overwrite, even though 11s have passed since the first set.
    expect(cache.get('key-a')).toEqual(updatedRows);
  });
});
