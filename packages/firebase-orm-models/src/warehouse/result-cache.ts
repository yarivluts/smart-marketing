import type { WarehouseRow } from './query-executor';
import { BoundedLruMap } from '../util/bounded-lru-map';

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
 * The largest number of distinct cache keys (org+project+definition-versions+params
 * combinations) kept resident at once. A placeholder pending real traffic data, same posture
 * `DEFAULT_API_KEY_RATE_LIMIT_CAPACITY` documents for its own number — large enough that eviction
 * is a non-event under normal load, small enough to bound this process's memory for the lifetime
 * of a long-running server instead of growing without limit.
 */
export const DEFAULT_METRIC_QUERY_RESULT_CACHE_MAX_ENTRIES = 5_000;

/**
 * In-process stand-in for a real Redis result cache. Like
 * `InMemoryTokenBucketRateLimiter`, this only dedupes within a single API
 * server instance — a real deployment behind multiple instances needs a
 * shared Redis (or similar) cache for the "cached" half of the AC's own
 * "p95 < 1.5s on cached" latency target to hold across instances, not just
 * within one. Bounded to `maxEntries` distinct keys via `BoundedLruMap`, so a
 * long-running process's memory doesn't grow without limit as new org/project/param
 * combinations get queried over its lifetime.
 */
export class InMemoryMetricQueryResultCache implements MetricQueryResultCache {
  private readonly store: BoundedLruMap<string, CacheEntry>;
  private readonly now: () => number;

  /** `now` is injectable (defaults to the real clock) so tests can exercise TTL expiry deterministically, the same pattern `InMemoryTokenBucketRateLimiter` uses. */
  constructor(now: () => number = Date.now, maxEntries: number = DEFAULT_METRIC_QUERY_RESULT_CACHE_MAX_ENTRIES) {
    this.now = now;
    this.store = new BoundedLruMap(maxEntries);
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
