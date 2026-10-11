/**
 * Groups timestamped values into consecutive calendar periods (UTC days, UTC weeks starting Monday,
 * or UTC months) ending at the period that contains `now`, so a page can chart "per week" / "per month"
 * from the rows it already loaded.
 *
 * `reliableFrom` is for capped reads: when a page only fetched the most recent N rows, periods that
 * end before the oldest fetched row were never looked at. Those come back as `null` (unknown), not
 * `0` (nothing happened) - drawing them as zero would invent a rising trend out of the fetch limit.
 * A period that straddles `reliableFrom` is partially read; it keeps its (floor) total.
 */
export type BucketPeriod = 'day' | 'week' | 'month';

export interface PeriodBucket {
  /** The period's first day, `YYYY-MM-DD` (UTC). */
  start: string;
  /** Sum of the values that fell in the period; `null` when the period was never read. */
  total: number | null;
  /** How many items fell in the period; `null` when the period was never read. */
  count: number | null;
}

export interface BucketByPeriodOptions {
  period: BucketPeriod;
  /** How many periods to return, oldest first, the last one containing `now`. */
  periods: number;
  now: Date;
  reliableFrom?: string | null;
}

function periodStartMs(ms: number, period: BucketPeriod): number {
  const date = new Date(ms);
  if (period === 'month') {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  }
  if (period === 'day') {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  const day = date.getUTCDay();
  const offsetToMonday = (day + 6) % 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - offsetToMonday);
}

function stepBack(startMs: number, period: BucketPeriod, steps: number): number {
  const date = new Date(startMs);
  if (period === 'month') {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - steps, 1);
  }
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - steps * (period === 'day' ? 1 : 7));
}

export function bucketByPeriod(items: readonly { at: string; value?: number }[], options: BucketByPeriodOptions): PeriodBucket[] {
  const { period, periods, now } = options;
  const currentStart = periodStartMs(now.getTime(), period);
  const starts = Array.from({ length: Math.max(0, periods) }, (_, index) => stepBack(currentStart, period, periods - 1 - index));
  const reliableFromMs = options.reliableFrom ? Date.parse(options.reliableFrom) : Number.NaN;

  const totals = new Map<number, { total: number; count: number }>(starts.map((start) => [start, { total: 0, count: 0 }]));
  for (const item of items) {
    const ms = Date.parse(item.at);
    if (Number.isNaN(ms)) continue;
    const bucket = totals.get(periodStartMs(ms, period));
    if (!bucket) continue;
    bucket.total += item.value ?? 1;
    bucket.count += 1;
  }

  return starts.map((start, index) => {
    const nextStart = index + 1 < starts.length ? starts[index + 1] : stepBack(start, period, -1);
    const neverRead = Number.isFinite(reliableFromMs) && nextStart <= reliableFromMs;
    const bucket = totals.get(start)!;
    return {
      start: new Date(start).toISOString().slice(0, 10),
      total: neverRead ? null : bucket.total,
      count: neverRead ? null : bucket.count,
    };
  });
}

/** The earliest parseable timestamp among `values`, or `null` when there is none. */
export function earliestTimestamp(values: readonly string[]): string | null {
  let earliest: number | null = null;
  for (const value of values) {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms) && (earliest === null || ms < earliest)) earliest = ms;
  }
  return earliest === null ? null : new Date(earliest).toISOString();
}
