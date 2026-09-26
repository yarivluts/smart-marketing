/**
 * Label helpers for the board's hand-drawn time-series tiles (KAN-210). A bar or line tile used to
 * draw only marks - no value, no date, no axis - so "signups = 3 on 25.9" could not be read off a
 * board or a screenshot of one. These decide what text goes on the chart; the chart components
 * render it.
 */

/** Up to this many points, every bar/point carries its value and every bucket its axis label. */
export const MAX_FULLY_LABELED_POINTS = 12;

/** Beyond `MAX_FULLY_LABELED_POINTS`, roughly this many axis labels are kept, anchored on the latest bucket. */
const THINNED_AXIS_LABEL_TARGET = 7;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:$|T00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)?$)/;

function parseBucketDate(bucket: string): Date | null {
  const match = ISO_DATE.exec(bucket);
  if (!match) {
    return null;
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Short, locale-formatted axis labels for a list of buckets (same order as given). Date buckets
 * (`2026-09-25`, or a midnight ISO timestamp) render as day + month (`9/25` in en, `25.9` in he),
 * with the year added only when the buckets span more than one; month-start buckets spanning several
 * months (a monthly grain) render as month + year. Formatted in UTC, since a bucket date is a
 * calendar day, not an instant - local-time formatting would shift it a day west of UTC. A bucket
 * that is not a date is returned unchanged.
 */
export function formatBucketLabels(buckets: readonly string[], locale: string): string[] {
  const dates = buckets.map(parseBucketDate);
  if (dates.length === 0 || dates.some((date) => date === null)) {
    return [...buckets];
  }
  const parsed = dates as Date[];
  const years = new Set(parsed.map((date) => date.getUTCFullYear()));
  const months = new Set(parsed.map((date) => `${date.getUTCFullYear()}-${date.getUTCMonth()}`));
  const isMonthly = months.size > 1 && parsed.every((date) => date.getUTCDate() === 1);
  const options: Intl.DateTimeFormatOptions = isMonthly
    ? // A four-digit year: "Sep 26" would read as the 26th of September.
      { month: 'short', year: 'numeric', timeZone: 'UTC' }
    : { day: 'numeric', month: 'numeric', ...(years.size > 1 ? { year: '2-digit' as const } : {}), timeZone: 'UTC' };
  const format = new Intl.DateTimeFormat(locale, options);
  return parsed.map((date) => format.format(date));
}

/** One drawable point of a series: a bucket with a real value, and its position in the series. */
export interface PresentPoint {
  bucket: string;
  value: number;
  index: number;
}

/**
 * Splits a series at its gaps (`null`, "no value" for that bucket) into runs of consecutive real
 * points. A line is drawn per run, so a chart never draws a straight line across a bucket that had
 * no value - which would claim a trend nobody measured.
 */
export function splitAtGaps(points: readonly { bucket: string; value: number | null }[]): PresentPoint[][] {
  const runs: PresentPoint[][] = [];
  let current: PresentPoint[] = [];
  points.forEach((point, index) => {
    if (point.value === null) {
      if (current.length > 0) {
        runs.push(current);
      }
      current = [];
      return;
    }
    current.push({ bucket: point.bucket, value: point.value, index });
  });
  if (current.length > 0) {
    runs.push(current);
  }
  return runs;
}

/** The newest point with a real value (a legend's "latest" figure) - a trailing gap is not a reading. */
export function latestPresentPoint(points: readonly { bucket: string; value: number | null }[]): PresentPoint | undefined {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = points[index].value;
    if (value !== null) {
      return { bucket: points[index].bucket, value, index };
    }
  }
  return undefined;
}

function allIndexes(count: number): Set<number> {
  return new Set(Array.from({ length: count }, (_, index) => index));
}

/**
 * Which points carry a visible value label. A short series labels every point. A long one would
 * collide, so only its peak and its latest point are labelled. Every value stays available
 * regardless, in the chart's screen-reader table and per-mark tooltip.
 */
export function labeledValueIndexes(values: readonly (number | null)[]): Set<number> {
  // A `null` is a gap ("no value" for that bucket) - there is no mark to label there.
  const present = values.flatMap((value, index) => (value === null ? [] : [index]));
  if (values.length <= MAX_FULLY_LABELED_POINTS || present.length === 0) {
    return new Set(present);
  }
  const peak = present.reduce((best, index) => ((values[index] as number) > (values[best] as number) ? index : best), present[0]);
  return new Set([peak, present[present.length - 1]]);
}

/**
 * Which buckets carry a visible axis label: all of them for a short series, otherwise roughly
 * `THINNED_AXIS_LABEL_TARGET` evenly spaced ones counted back from the latest bucket (the one a
 * reader most often wants), so the latest is always labelled.
 */
export function labeledAxisIndexes(count: number): Set<number> {
  if (count <= MAX_FULLY_LABELED_POINTS) {
    return allIndexes(count);
  }
  const step = Math.ceil((count - 1) / (THINNED_AXIS_LABEL_TARGET - 1));
  const axis = new Set<number>();
  for (let index = count - 1; index >= 0; index -= step) {
    axis.add(index);
  }
  return axis;
}
