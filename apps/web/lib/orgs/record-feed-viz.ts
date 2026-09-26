import type { RecordFeedEntryView } from './record-feed-view';

/**
 * Summary shaping for the record feed page, over the records the feed already shows (never a
 * separate count): identity coverage, arrival rhythm and the most common value of one field.
 */

export interface IdentityCoverage {
  total: number;
  /** Records carrying at least one identity key. */
  identified: number;
  distinctAnonIds: number;
  distinctCustomerIds: number;
}

export function identityCoverage(entries: readonly RecordFeedEntryView[]): IdentityCoverage {
  const anon = new Set<string>();
  const customers = new Set<string>();
  let identified = 0;
  for (const entry of entries) {
    if (entry.identity.length > 0) identified += 1;
    for (const key of entry.identity) {
      if (key.isPii) continue;
      if (key.name === 'anon_id') anon.add(key.value);
      if (key.name === 'customer_id') customers.add(key.value);
    }
  }
  return { total: entries.length, identified, distinctAnonIds: anon.size, distinctCustomerIds: customers.size };
}

export interface ArrivalBuckets {
  granularity: 'hour' | 'day';
  /** Contiguous buckets from the oldest to the newest record shown, oldest first; `start` is the bucket's ISO start. */
  buckets: { start: string; count: number }[];
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * When the shown records landed, bucketed per hour when they span two days or less and per day
 * otherwise. Empty buckets between the first and last record are kept so gaps read as gaps; the
 * range is capped (`maxBuckets`, newest kept) so one ancient record cannot stretch the chart.
 */
export function arrivalBuckets(entries: readonly RecordFeedEntryView[], maxBuckets = 48): ArrivalBuckets {
  const times = entries.map((entry) => Date.parse(entry.landedAt)).filter((ms) => !Number.isNaN(ms));
  if (times.length === 0) return { granularity: 'hour', buckets: [] };
  const newest = Math.max(...times);
  const oldest = Math.min(...times);
  const granularity: ArrivalBuckets['granularity'] = newest - oldest <= 2 * DAY_MS ? 'hour' : 'day';
  const size = granularity === 'hour' ? HOUR_MS : DAY_MS;
  const floor = (ms: number) => Math.floor(ms / size) * size;
  const last = floor(newest);
  const first = Math.max(floor(oldest), last - (maxBuckets - 1) * size);
  const buckets: { start: string; count: number }[] = [];
  for (let start = first; start <= last; start += size) {
    buckets.push({ start: new Date(start).toISOString(), count: 0 });
  }
  for (const ms of times) {
    const index = (floor(ms) - first) / size;
    if (index >= 0 && index < buckets.length) buckets[index].count += 1;
  }
  return { granularity, buckets };
}

export interface FieldValueBreakdown {
  field: string;
  values: { value: string; count: number }[];
}

/**
 * The declared non-PII field whose values repeat the most across the shown records (e.g. a `cta` or
 * `plan` field), with its values ranked - the quickest read of what the feed is made of. `null` when
 * no field has a value that occurs more than once.
 */
export function mostCommonFieldValues(entries: readonly RecordFeedEntryView[], maxValues = 6): FieldValueBreakdown | null {
  const byField = new Map<string, Map<string, number>>();
  for (const entry of entries) {
    for (const field of entry.fields) {
      if (field.isPii || field.value === '') continue;
      const counts = byField.get(field.name) ?? new Map<string, number>();
      counts.set(field.value, (counts.get(field.value) ?? 0) + 1);
      byField.set(field.name, counts);
    }
  }
  let best: { field: string; counts: Map<string, number>; score: number } | null = null;
  for (const [field, counts] of byField) {
    const filled = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const top = Math.max(...counts.values());
    if (top < 2) continue;
    // Prefer fields that split the feed into a few meaningful groups over single-valued ones.
    const score = counts.size === 1 ? filled / 10 : filled / counts.size;
    if (!best || score > best.score) best = { field, counts, score };
  }
  if (!best) return null;
  const values = [...best.counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxValues)
    .map(([value, count]) => ({ value, count }));
  return { field: best.field, values };
}
