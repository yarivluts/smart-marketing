import { describe, expect, it } from 'vitest';
import { InvalidStripeSyncCursorError, initialStripeSyncCursor, parseStripeSyncCursor, serializeStripeSyncCursor } from './cursor';

describe('initialStripeSyncCursor', () => {
  it('starts in the events phase with every resource fresh', () => {
    const cursor = initialStripeSyncCursor();
    expect(cursor.phase).toBe('events');
    expect(cursor.events.charge).toEqual({ backfillCursor: null, backfillComplete: false, lastSyncedCreated: null });
    expect(cursor.events.invoice).toEqual({ backfillCursor: null, backfillComplete: false, lastSyncedCreated: null });
    expect(cursor.events.refund).toEqual({ backfillCursor: null, backfillComplete: false, lastSyncedCreated: null });
    expect(cursor.events.cancellation).toEqual({ backfillCursor: null, backfillComplete: false, lastSyncedCreated: null });
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

  it('resumes a cursor persisted before the cancellation resource existed, starting only that resource fresh', () => {
    const legacy = initialStripeSyncCursor() as unknown as { events: Record<string, unknown> };
    delete legacy.events.cancellation;
    (legacy.events.charge as Record<string, unknown>).lastSyncedCreated = 500;
    const parsed = parseStripeSyncCursor(JSON.stringify(legacy));
    expect(parsed.events.charge.lastSyncedCreated).toBe(500);
    expect(parsed.events.cancellation).toEqual({ backfillCursor: null, backfillComplete: false, lastSyncedCreated: null });
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
