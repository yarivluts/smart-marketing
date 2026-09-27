import { describe, expect, it } from 'vitest';
import { bucketByPeriod, earliestTimestamp } from './period-buckets';

describe('bucketByPeriod', () => {
  const now = new Date('2026-09-17T12:00:00Z'); // a Thursday

  it('returns consecutive Monday-start weeks ending with the current week, oldest first', () => {
    const buckets = bucketByPeriod([], { period: 'week', periods: 3, now });
    expect(buckets.map((bucket) => bucket.start)).toEqual(['2026-08-31', '2026-09-07', '2026-09-14']);
    expect(buckets.every((bucket) => bucket.count === 0 && bucket.total === 0)).toBe(true);
  });

  it('counts items and sums their values into the period they fall in', () => {
    const buckets = bucketByPeriod(
      [
        { at: '2026-09-14T00:00:00Z', value: 10 },
        { at: '2026-09-16T23:59:59Z', value: 5 },
        { at: '2026-09-13T23:59:59Z', value: 7 },
      ],
      { period: 'week', periods: 2, now },
    );
    expect(buckets).toEqual([
      { start: '2026-09-07', total: 7, count: 1 },
      { start: '2026-09-14', total: 15, count: 2 },
    ]);
  });

  it('counts each item once when no value is given', () => {
    const buckets = bucketByPeriod([{ at: '2026-09-17' }, { at: '2026-09-17T08:00:00Z' }], { period: 'day', periods: 1, now });
    expect(buckets).toEqual([{ start: '2026-09-17', total: 2, count: 2 }]);
  });

  it('buckets by calendar month across a year boundary', () => {
    const buckets = bucketByPeriod([{ at: '2025-12-31T10:00:00Z', value: 3 }, { at: '2026-01-02', value: 4 }], {
      period: 'month',
      periods: 3,
      now: new Date('2026-01-15T00:00:00Z'),
    });
    expect(buckets).toEqual([
      { start: '2025-11-01', total: 0, count: 0 },
      { start: '2025-12-01', total: 3, count: 1 },
      { start: '2026-01-01', total: 4, count: 1 },
    ]);
  });

  it('ignores items outside the window and unparseable timestamps', () => {
    const buckets = bucketByPeriod([{ at: '2020-01-01' }, { at: 'not a date' }, { at: '2026-09-17' }], { period: 'day', periods: 2, now });
    expect(buckets.map((bucket) => bucket.count)).toEqual([0, 1]);
  });

  it('reports periods that end before reliableFrom as unknown (null), not zero', () => {
    const buckets = bucketByPeriod([{ at: '2026-09-16T10:00:00Z' }], { period: 'day', periods: 4, now, reliableFrom: '2026-09-15T18:00:00Z' });
    expect(buckets).toEqual([
      { start: '2026-09-14', total: null, count: null },
      // The day reliableFrom falls in was partly read: it keeps its (floor) count.
      { start: '2026-09-15', total: 0, count: 0 },
      { start: '2026-09-16', total: 1, count: 1 },
      { start: '2026-09-17', total: 0, count: 0 },
    ]);
  });
});

describe('earliestTimestamp', () => {
  it('returns the earliest parseable timestamp as ISO, or null when there is none', () => {
    expect(earliestTimestamp(['2026-09-02T00:00:00Z', 'garbage', '2026-08-30T12:00:00Z'])).toBe('2026-08-30T12:00:00.000Z');
    expect(earliestTimestamp([])).toBeNull();
    expect(earliestTimestamp(['nope'])).toBeNull();
  });
});
