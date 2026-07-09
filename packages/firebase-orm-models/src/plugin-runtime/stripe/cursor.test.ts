import { describe, expect, it } from 'vitest';
import { InvalidStripeSyncCursorError, initialStripeSyncCursor, parseStripeSyncCursor, serializeStripeSyncCursor } from './cursor';

describe('initialStripeSyncCursor', () => {
  it('starts in the events phase with every resource fresh', () => {
    const cursor = initialStripeSyncCursor();
    expect(cursor.phase).toBe('events');
    expect(cursor.events.charge).toEqual({ backfillCursor: null, backfillComplete: false, lastSyncedCreated: null });
    expect(cursor.events.invoice).toEqual({ backfillCursor: null, backfillComplete: false, lastSyncedCreated: null });
    expect(cursor.events.refund).toEqual({ backfillCursor: null, backfillComplete: false, lastSyncedCreated: null });
    expect(cursor.entities.subscription).toEqual({ backfillCursor: null, backfillComplete: false, lastSyncedCreated: null });
  });
});

describe('parseStripeSyncCursor', () => {
  it('returns a fresh cursor for null — "sync from scratch"', () => {
    expect(parseStripeSyncCursor(null)).toEqual(initialStripeSyncCursor());
  });

  it('round-trips through serialize/parse', () => {
    const cursor = initialStripeSyncCursor();
    cursor.phase = 'entities';
    cursor.events.charge = { backfillCursor: 'ch_5', backfillComplete: false, lastSyncedCreated: 100 };
    const serialized = serializeStripeSyncCursor(cursor);
    expect(parseStripeSyncCursor(serialized)).toEqual(cursor);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseStripeSyncCursor('not json')).toThrow(InvalidStripeSyncCursorError);
  });

  it('rejects a JSON value that is valid JSON but not a valid cursor shape', () => {
    expect(() => parseStripeSyncCursor('{"phase":"bogus"}')).toThrow(InvalidStripeSyncCursorError);
    expect(() => parseStripeSyncCursor('{"phase":"events"}')).toThrow(InvalidStripeSyncCursorError);
    expect(() => parseStripeSyncCursor('42')).toThrow(InvalidStripeSyncCursorError);
  });
});
