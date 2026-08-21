/**
 * A `Map` wrapper that evicts the least-recently-used entry once its size would exceed
 * `maxEntries`. Backs every in-process, unbounded-key-space store in this package that stands in
 * for a real Redis instance until KAN-18 provisions one (`InMemoryMetricQueryResultCache`,
 * `InMemoryTokenBucketRateLimiter`'s bucket map) — those track one entry per distinct cache key /
 * API key for the lifetime of the server process, which without a cap grows without bound. `get`
 * counts as a use and refreshes the entry's recency; `set` inserts/updates and evicts the least
 * recently used entry (not necessarily the one just inserted) if over capacity.
 */
export class BoundedLruMap<K, V> {
  private readonly store = new Map<K, V>();
  private readonly maxEntries: number;

  constructor(maxEntries: number) {
    if (!(maxEntries > 0)) {
      throw new Error('maxEntries must be a positive number');
    }
    this.maxEntries = maxEntries;
  }

  get size(): number {
    return this.store.size;
  }

  get(key: K): V | undefined {
    if (!this.store.has(key)) {
      return undefined;
    }
    const value = this.store.get(key) as V;
    // Re-insert to move this key to the end of Map's iteration order (most-recently-used).
    this.store.delete(key);
    this.store.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    this.store.delete(key);
    this.store.set(key, value);
    if (this.store.size > this.maxEntries) {
      const leastRecentlyUsedKey = this.store.keys().next().value as K;
      this.store.delete(leastRecentlyUsedKey);
    }
  }

  delete(key: K): void {
    this.store.delete(key);
  }
}
