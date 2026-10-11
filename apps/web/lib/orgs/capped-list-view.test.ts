import { describe, expect, it } from 'vitest';
import { splitOverFetchedFeed } from './capped-list-view';

describe('splitOverFetchedFeed', () => {
  it('returns the capped page and reports truncation when the probe row came back', () => {
    // The caller fetches cap + 1; the extra row is evidence, not an entry.
    const rows = Array.from({ length: 101 }, (_unused, index) => index);
    const page = splitOverFetchedFeed(rows, 100);
    expect(page.rows).toHaveLength(100);
    expect(page.truncated).toBe(true);
    expect(page.rows).not.toContain(100);
  });

  it('reports no truncation when exactly the cap came back', () => {
    // The case a length check gets wrong: exactly `cap` rows is a COMPLETE
    // ledger, not a truncated one, and on a billing feed that distinction is the
    // difference between reconciling and guessing.
    const rows = Array.from({ length: 100 }, (_unused, index) => index);
    const page = splitOverFetchedFeed(rows, 100);
    expect(page.rows).toHaveLength(100);
    expect(page.truncated).toBe(false);
  });

  it('handles a short page and an empty one', () => {
    expect(splitOverFetchedFeed([1, 2, 3], 100)).toEqual({ rows: [1, 2, 3], truncated: false });
    expect(splitOverFetchedFeed([], 100)).toEqual({ rows: [], truncated: false });
  });
});
