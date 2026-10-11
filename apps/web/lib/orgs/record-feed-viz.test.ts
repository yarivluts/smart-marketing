import { describe, expect, it } from 'vitest';
import type { RecordFeedEntryView } from './record-feed-view';
import { arrivalBuckets, identityCoverage, mostCommonFieldValues } from './record-feed-viz';

function entry(id: string, landedAt: string, fields: Record<string, string> = {}, identity: Record<string, string> = {}): RecordFeedEntryView {
  return {
    id,
    environmentId: 'env-dev',
    clientId: id,
    landedAt,
    fields: Object.entries(fields).map(([name, value]) => ({ name, value, isPii: name === 'email' })),
    identity: Object.entries(identity).map(([name, value]) => ({ name, value, isPii: false })),
  };
}

describe('identityCoverage', () => {
  it('counts identified records and distinct identities', () => {
    const coverage = identityCoverage([
      entry('a', '2026-09-25T10:00:00Z', {}, { anon_id: 'x' }),
      entry('b', '2026-09-25T10:05:00Z', {}, { anon_id: 'x', customer_id: 'c1' }),
      entry('c', '2026-09-25T10:10:00Z'),
    ]);
    expect(coverage).toEqual({ total: 3, identified: 2, distinctAnonIds: 1, distinctCustomerIds: 1 });
  });
});

describe('arrivalBuckets', () => {
  it('buckets per hour within two days, keeping empty hours between records', () => {
    const result = arrivalBuckets([entry('a', '2026-09-25T10:15:00Z'), entry('b', '2026-09-25T10:45:00Z'), entry('c', '2026-09-25T13:05:00Z')]);
    expect(result.granularity).toBe('hour');
    expect(result.buckets.map((bucket) => bucket.count)).toEqual([2, 0, 0, 1]);
    expect(result.buckets[0].start).toBe('2026-09-25T10:00:00.000Z');
  });

  it('switches to days for a longer span and caps the range at the newest buckets', () => {
    const result = arrivalBuckets([entry('a', '2026-09-01T10:00:00Z'), entry('b', '2026-09-25T10:00:00Z'), entry('c', '2026-09-24T10:00:00Z')], 3);
    expect(result.granularity).toBe('day');
    expect(result.buckets.map((bucket) => [bucket.start.slice(0, 10), bucket.count])).toEqual([
      ['2026-09-23', 0],
      ['2026-09-24', 1],
      ['2026-09-25', 1],
    ]);
  });

  it('is empty with no records', () => {
    expect(arrivalBuckets([]).buckets).toEqual([]);
  });
});

describe('mostCommonFieldValues', () => {
  it('picks the field that splits the feed into repeated groups, ignoring PII and blanks', () => {
    const result = mostCommonFieldValues([
      entry('a', '2026-09-25T10:00:00Z', { cta: 'hero', locale: 'he', path: '', email: 'x@y' }),
      entry('b', '2026-09-25T10:00:00Z', { cta: 'hero', locale: 'he', path: '', email: 'x@y' }),
      entry('c', '2026-09-25T10:00:00Z', { cta: 'header', locale: 'he', path: '', email: 'x@y' }),
      entry('d', '2026-09-25T10:00:00Z', { cta: 'header', locale: 'he', path: '', email: 'x@y' }),
    ]);
    expect(result).toEqual({ field: 'cta', values: [{ value: 'header', count: 2 }, { value: 'hero', count: 2 }] });
  });

  it('is null when nothing repeats', () => {
    expect(mostCommonFieldValues([entry('a', '2026-09-25T10:00:00Z', { id: '1' }), entry('b', '2026-09-25T10:00:00Z', { id: '2' })])).toBeNull();
  });
});
