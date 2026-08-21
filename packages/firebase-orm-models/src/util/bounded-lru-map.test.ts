import { describe, expect, it } from 'vitest';
import { BoundedLruMap } from './bounded-lru-map';

describe('BoundedLruMap', () => {
  it('rejects a non-positive maxEntries', () => {
    expect(() => new BoundedLruMap(0)).toThrow('maxEntries must be a positive number');
    expect(() => new BoundedLruMap(-1)).toThrow('maxEntries must be a positive number');
  });

  it('returns undefined for a key that was never set', () => {
    const map = new BoundedLruMap<string, number>(2);
    expect(map.get('missing')).toBeUndefined();
  });

  it('stores and retrieves values under the cap', () => {
    const map = new BoundedLruMap<string, number>(3);
    map.set('a', 1);
    map.set('b', 2);
    expect(map.get('a')).toBe(1);
    expect(map.get('b')).toBe(2);
    expect(map.size).toBe(2);
  });

  it('overwrites an existing key without growing size', () => {
    const map = new BoundedLruMap<string, number>(2);
    map.set('a', 1);
    map.set('a', 2);
    expect(map.get('a')).toBe(2);
    expect(map.size).toBe(1);
  });

  it('evicts the least-recently-used entry once over capacity', () => {
    const map = new BoundedLruMap<string, number>(2);
    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3); // 'a' is least-recently-used (never read since insert) -> evicted.
    expect(map.get('a')).toBeUndefined();
    expect(map.get('b')).toBe(2);
    expect(map.get('c')).toBe(3);
    expect(map.size).toBe(2);
  });

  it('a get() refreshes recency, protecting a key from the next eviction', () => {
    const map = new BoundedLruMap<string, number>(2);
    map.set('a', 1);
    map.set('b', 2);
    map.get('a'); // 'a' is now most-recently-used; 'b' becomes least-recently-used.
    map.set('c', 3);
    expect(map.get('a')).toBe(1);
    expect(map.get('b')).toBeUndefined();
    expect(map.get('c')).toBe(3);
  });

  it('delete removes an entry without affecting others', () => {
    const map = new BoundedLruMap<string, number>(2);
    map.set('a', 1);
    map.set('b', 2);
    map.delete('a');
    expect(map.get('a')).toBeUndefined();
    expect(map.get('b')).toBe(2);
    expect(map.size).toBe(1);
  });
});
