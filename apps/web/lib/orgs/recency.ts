/**
 * How recent a timestamp is, for "last used"/"last received" style labels. Pure and clock-injected so
 * pages and tests agree on the same `now`.
 */

export type RecencyBucket = 'hour' | 'day' | 'week' | 'month' | 'older';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** The recency band a timestamp falls in (a future timestamp counts as "within the hour"), or null when there is none. */
export function recencyBucket(iso: string | null | undefined, nowMs: number): RecencyBucket | null {
  const ms = parse(iso);
  if (ms === null) return null;
  const age = Math.max(0, nowMs - ms);
  if (age < HOUR_MS) return 'hour';
  if (age < DAY_MS) return 'day';
  if (age < 7 * DAY_MS) return 'week';
  if (age < 30 * DAY_MS) return 'month';
  return 'older';
}

/** "3 hours ago" (or its Hebrew equivalent) through `Intl.RelativeTimeFormat`, so no copy lives in code. Empty for a missing or invalid timestamp. */
export function formatRelativeTime(iso: string | null | undefined, nowMs: number, locale: string): string {
  const ms = parse(iso);
  if (ms === null) return '';
  const diff = ms - nowMs;
  const abs = Math.abs(diff);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (abs < HOUR_MS) return format.format(Math.round(diff / MINUTE_MS), 'minute');
  if (abs < DAY_MS) return format.format(Math.round(diff / HOUR_MS), 'hour');
  if (abs < 30 * DAY_MS) return format.format(Math.round(diff / DAY_MS), 'day');
  if (abs < 365 * DAY_MS) return format.format(Math.round(diff / (30 * DAY_MS)), 'month');
  return format.format(Math.round(diff / (365 * DAY_MS)), 'year');
}

/** Whether a timestamp is within the last `days` days of `nowMs`. */
export function isWithinDays(iso: string | null | undefined, nowMs: number, days: number): boolean {
  const ms = parse(iso);
  return ms !== null && nowMs - ms <= days * DAY_MS;
}

/**
 * One count per UTC day for the `days` days ending on `nowMs`'s day (oldest first, empty days
 * included), from a list of timestamps - the shape a sparkline or daily bar chart wants.
 */
export function dailyCountsFrom(timestamps: readonly (string | null | undefined)[], nowMs: number, days: number): { date: string; count: number }[] {
  const end = new Date(nowMs);
  end.setUTCHours(0, 0, 0, 0);
  const buckets = Array.from({ length: days }, (_, index) => ({
    date: new Date(end.getTime() - (days - 1 - index) * DAY_MS).toISOString().slice(0, 10),
    count: 0,
  }));
  const byDate = new Map(buckets.map((bucket) => [bucket.date, bucket]));
  for (const iso of timestamps) {
    const ms = parse(iso);
    if (ms === null) continue;
    const bucket = byDate.get(new Date(ms).toISOString().slice(0, 10));
    if (bucket) bucket.count += 1;
  }
  return buckets;
}
