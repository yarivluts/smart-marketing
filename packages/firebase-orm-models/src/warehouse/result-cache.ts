import type { WarehouseRow } from './query-executor';

/**
 * Result cache for compiled metric queries (KAN-42 AC: "Redis result cache,
 * keyed by def-version+params"), provider-agnostic so a real Redis-backed
 * implementation can slot in later without callers changing — the same
 * "buildable today, swap the provider later" split `rate-limit/`
 * (KAN-34) used for a token bucket until KAN-18 provisions real Redis. Keys
 * are opaque strings the caller derives (see `metrics-query.service.ts`'s
 * `buildResultCacheKey`) — this interface doesn't know or care what a key is
 * made of, only how to store and expire a value under it.
 */
export interface MetricQueryResultCache {
  get(key: string): WarehouseRow[] | undefined;
  set(key: string, series: WarehouseRow[], ttlSeconds: number): void;
}

interface CacheEntry {
  series: WarehouseRow[];
  expiresAt: number;
}

/**
 * In-process stand-in for a real Redis result cache. Like
 * `InMemoryTokenBucketRateLimiter`, this only dedupes within a single API
 * server instance — a real deployment behind multiple instances needs a
 * shared Redis (or similar) cache for the "cached" half of the AC's own
 * "p95 < 1.5s on cached" latency target to hold across instances, not just
 * within one.
 */
export class InMemoryMetricQueryResultCache implements MetricQueryResultCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly now: () => number;

  /** `now` is injectable (defaults to the real clock) so tests can exercise TTL expiry deterministically, the same pattern `InMemoryTokenBucketRateLimiter` uses. */
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  get(key: string): WarehouseRow[] | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.series;
  }

  set(key: string, series: WarehouseRow[], ttlSeconds: number): void {
    this.store.set(key, { series, expiresAt: this.now() + ttlSeconds * 1000 });
  }
}

export const defaultMetricQueryResultCache: MetricQueryResultCache = new InMemoryMetricQueryResultCache();
