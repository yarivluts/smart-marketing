import { describe, expect, it } from 'vitest';
import { aggregateRepCollectionLeaderboard, type RepCollectionEntryModel } from './rep-collection.service';

/**
 * Pure-function tests for `aggregateRepCollectionLeaderboard`'s period-window
 * math (KAN-88) — no Firestore access, so these run without the emulator and
 * can afford to brute-force edge cases the emulator suite's single
 * Monday-`now` fixture doesn't reach: a Sunday `now` (the `(dow + 6) % 7`
 * wrap), a week spanning a year rollover, and a full ISO datetime
 * `occurred_at` at the period's inclusive boundary.
 */

function entry(overrides: Partial<RepCollectionEntryModel>): RepCollectionEntryModel {
  return {
    org_person_id: null,
    amount: 0,
    occurred_at: '2026-08-24',
    ...overrides,
  } as RepCollectionEntryModel;
}

describe('aggregateRepCollectionLeaderboard — week window', () => {
  it('anchors correctly to a Sunday `now` (the far end of the (dow + 6) % 7 wrap)', () => {
    // 2026-08-30 is a Sunday; the ISO week it belongs to is 2026-08-24..2026-08-30.
    const now = new Date('2026-08-30T18:00:00.000Z');
    const result = aggregateRepCollectionLeaderboard([entry({ org_person_id: 'p1', amount: 10, occurred_at: '2026-08-24' })], 'week', now);
    expect(result.periodStart).toBe('2026-08-24');
    expect(result.periodEnd).toBe('2026-08-30');
    expect(result.rows).toEqual([{ orgPersonId: 'p1', totalAmount: 10, entryCount: 1 }]);
  });

  it('spans a year rollover correctly', () => {
    // 2026-12-30 is a Wednesday; that week is 2026-12-28..2027-01-03.
    const now = new Date('2026-12-30T00:00:00.000Z');
    const result = aggregateRepCollectionLeaderboard(
      [entry({ org_person_id: 'p1', amount: 5, occurred_at: '2026-12-28' }), entry({ org_person_id: 'p1', amount: 7, occurred_at: '2027-01-03' })],
      'week',
      now,
    );
    expect(result.periodStart).toBe('2026-12-28');
    expect(result.periodEnd).toBe('2027-01-03');
    expect(result.rows).toEqual([{ orgPersonId: 'p1', totalAmount: 12, entryCount: 2 }]);
  });

  it('includes a full ISO datetime occurred_at at the period end boundary (23:59:59 on the last day)', () => {
    const now = new Date('2026-08-24T12:00:00.000Z');
    const result = aggregateRepCollectionLeaderboard(
      [entry({ org_person_id: 'p1', amount: 20, occurred_at: '2026-08-30T23:59:59.000Z' })],
      'week',
      now,
    );
    expect(result.rows).toEqual([{ orgPersonId: 'p1', totalAmount: 20, entryCount: 1 }]);
  });

  it('excludes an entry the instant after the period end boundary', () => {
    const now = new Date('2026-08-24T12:00:00.000Z');
    const result = aggregateRepCollectionLeaderboard([entry({ org_person_id: 'p1', amount: 20, occurred_at: '2026-08-31T00:00:00.000Z' })], 'week', now);
    expect(result.rows).toEqual([]);
  });
});

describe('aggregateRepCollectionLeaderboard — month window', () => {
  it('spans a February in a leap year correctly', () => {
    const now = new Date('2028-02-15T00:00:00.000Z');
    const result = aggregateRepCollectionLeaderboard([entry({ org_person_id: 'p1', amount: 1, occurred_at: '2028-02-29' })], 'month', now);
    expect(result.periodStart).toBe('2028-02-01');
    expect(result.periodEnd).toBe('2028-02-29');
    expect(result.rows).toEqual([{ orgPersonId: 'p1', totalAmount: 1, entryCount: 1 }]);
  });
});

describe('aggregateRepCollectionLeaderboard — bucketing', () => {
  it('sorts rows by total amount descending and separates unattributed collections', () => {
    const now = new Date('2026-08-24T12:00:00.000Z');
    const result = aggregateRepCollectionLeaderboard(
      [
        entry({ org_person_id: 'p1', amount: 100, occurred_at: '2026-08-25' }),
        entry({ org_person_id: 'p2', amount: 300, occurred_at: '2026-08-26' }),
        entry({ org_person_id: 'p1', amount: 50, occurred_at: '2026-08-27' }),
        entry({ org_person_id: null, amount: 40, occurred_at: '2026-08-28' }),
      ],
      'week',
      now,
    );
    expect(result.rows).toEqual([
      { orgPersonId: 'p2', totalAmount: 300, entryCount: 1 },
      { orgPersonId: 'p1', totalAmount: 150, entryCount: 2 },
    ]);
    expect(result.unattributedTotal).toBe(40);
    expect(result.unattributedCount).toBe(1);
  });

  it('defaults `now` to the current time when omitted', () => {
    const result = aggregateRepCollectionLeaderboard([], 'week');
    expect(typeof result.periodStart).toBe('string');
    expect(result.rows).toEqual([]);
  });
});
