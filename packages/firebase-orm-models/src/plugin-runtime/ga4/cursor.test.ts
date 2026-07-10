import { describe, expect, it } from 'vitest';
import {
  addDaysUtc,
  DEFAULT_GA4_BACKFILL_DAYS,
  initialGa4SyncCursor,
  InvalidGa4SyncCursorError,
  parseGa4SyncCursor,
  serializeGa4SyncCursor,
  toDateString,
} from './cursor';

describe('toDateString', () => {
  it('formats a Date as a UTC YYYY-MM-DD string', () => {
    expect(toDateString(new Date('2026-07-10T23:59:00.000Z'))).toBe('2026-07-10');
  });
});

describe('addDaysUtc', () => {
  it('adds days within a month', () => {
    expect(addDaysUtc('2026-07-10', 3)).toBe('2026-07-13');
  });

  it('subtracts days across a month boundary', () => {
    expect(addDaysUtc('2026-07-01', -1)).toBe('2026-06-30');
  });

  it('handles a year boundary', () => {
    expect(addDaysUtc('2025-12-31', 1)).toBe('2026-01-01');
  });
});

describe('initialGa4SyncCursor', () => {
  it('starts both resources backfillDays before today', () => {
    const cursor = initialGa4SyncCursor('2026-07-10', 10);
    expect(cursor).toEqual({
      sessions: { nextDate: '2026-06-30' },
      events: { nextDate: '2026-06-30' },
    });
  });

  it('defaults to DEFAULT_GA4_BACKFILL_DAYS when not given', () => {
    const cursor = initialGa4SyncCursor('2026-07-10');
    expect(cursor.sessions.nextDate).toBe(addDaysUtc('2026-07-10', -DEFAULT_GA4_BACKFILL_DAYS));
  });
});

describe('parseGa4SyncCursor', () => {
  it('returns a fresh cursor for null (sync from scratch)', () => {
    expect(parseGa4SyncCursor(null, '2026-07-10', 5)).toEqual(initialGa4SyncCursor('2026-07-10', 5));
  });

  it('round-trips a serialized cursor', () => {
    const original = initialGa4SyncCursor('2026-07-10', 5);
    const serialized = serializeGa4SyncCursor(original);
    expect(parseGa4SyncCursor(serialized, '2026-07-10', 5)).toEqual(original);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseGa4SyncCursor('not-json', '2026-07-10')).toThrow(InvalidGa4SyncCursorError);
  });

  it('rejects JSON missing the events resource', () => {
    expect(() => parseGa4SyncCursor(JSON.stringify({ sessions: { nextDate: '2026-01-01' } }), '2026-07-10')).toThrow(InvalidGa4SyncCursorError);
  });
});
