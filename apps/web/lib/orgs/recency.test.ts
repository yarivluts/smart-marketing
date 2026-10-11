import { describe, expect, it } from 'vitest';
import { dailyCountsFrom, formatRelativeTime, isWithinDays, recencyBucket } from './recency';

const NOW = Date.parse('2026-09-26T12:00:00.000Z');

describe('recencyBucket', () => {
  it('bands a timestamp by its age', () => {
    expect(recencyBucket('2026-09-26T11:30:00.000Z', NOW)).toBe('hour');
    expect(recencyBucket('2026-09-26T01:00:00.000Z', NOW)).toBe('day');
    expect(recencyBucket('2026-09-22T12:00:00.000Z', NOW)).toBe('week');
    expect(recencyBucket('2026-09-10T12:00:00.000Z', NOW)).toBe('month');
    expect(recencyBucket('2026-06-01T12:00:00.000Z', NOW)).toBe('older');
  });

  it('has no band for a missing or invalid timestamp, and treats the future as now', () => {
    expect(recencyBucket(undefined, NOW)).toBeNull();
    expect(recencyBucket('not a date', NOW)).toBeNull();
    expect(recencyBucket('2026-09-27T12:00:00.000Z', NOW)).toBe('hour');
  });
});

describe('formatRelativeTime', () => {
  it('formats through Intl in the given locale', () => {
    expect(formatRelativeTime('2026-09-26T09:00:00.000Z', NOW, 'en')).toBe('3 hours ago');
    expect(formatRelativeTime('2026-09-23T12:00:00.000Z', NOW, 'en')).toBe('3 days ago');
    expect(formatRelativeTime('2026-09-23T12:00:00.000Z', NOW, 'he')).not.toBe('3 days ago');
    expect(formatRelativeTime(null, NOW, 'en')).toBe('');
  });
});

describe('isWithinDays', () => {
  it('checks the trailing window', () => {
    expect(isWithinDays('2026-09-20T12:00:00.000Z', NOW, 7)).toBe(true);
    expect(isWithinDays('2026-09-18T12:00:00.000Z', NOW, 7)).toBe(false);
    expect(isWithinDays(undefined, NOW, 7)).toBe(false);
  });
});

describe('dailyCountsFrom', () => {
  it('buckets timestamps per UTC day with empty days kept, oldest first', () => {
    const counts = dailyCountsFrom(['2026-09-26T01:00:00.000Z', '2026-09-26T08:00:00.000Z', '2026-09-24T23:59:00.000Z', '2026-08-01T00:00:00.000Z', null], NOW, 3);
    expect(counts).toEqual([
      { date: '2026-09-24', count: 1 },
      { date: '2026-09-25', count: 0 },
      { date: '2026-09-26', count: 2 },
    ]);
  });
});
