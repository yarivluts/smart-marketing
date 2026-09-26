import { computeCompareWindow, type TimeWindow } from './time';
import { MetricCompilerError, TIME_GRAINS, TOTAL_GRAIN, type MetricCatalog, type MetricQueryGrain, type MetricQueryTimeRange, type TimeGrain } from './types';

/**
 * What an empty time bucket means for one metric (KAN-210 follow-up).
 *
 * The compiled query `GROUP BY`s the bucket, so a day with no matching rows produces no output row
 * at all. For a count or a sum that absence is a real zero - nothing happened that day - and
 * leaving it out makes a line tile draw a straight climb across days that never happened, and a bar
 * tile show two bars as if their days were adjacent.
 *
 * For anything else an empty bucket is "no value", not 0: the average of nothing is undefined, a
 * min/max of nothing is undefined, and a formula (a ratio like CAC, typically) over an empty bucket
 * divides nothing by nothing. Writing 0 there would invent a data point, so those buckets get an
 * explicit `null` - a chart draws a gap there and must not interpolate across it.
 */
export type EmptyBucketValue = 'zero' | 'gap';

const ZERO_FILL_FUNCTIONS = new Set(['count', 'count_distinct', 'sum']);

/** See {@link EmptyBucketValue}. A formula is always `gap`, even over count leaves: it can divide, and 0/0 is not 0. */
export function emptyBucketValueForMetric(catalog: MetricCatalog, name: string): EmptyBucketValue {
  const definition = catalog.get(name);
  if (definition?.definitionKind === 'aggregation' && definition.aggregation && ZERO_FILL_FUNCTIONS.has(definition.aggregation.function)) {
    return 'zero';
  }
  return 'gap';
}

/**
 * A fill that would add more buckets than this (per period) is skipped and the rows are returned
 * untouched. Day grain over a year is 366 buckets; this leaves room for a few years of days while
 * refusing a pathological range (e.g. a histogram tile's `1970-01-01` floor) that would add tens of
 * thousands of rows per series.
 */
export const MAX_FILLED_BUCKETS = 1500;

function parseUtc(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new MetricCompilerError(`Invalid date "${value}" - expected YYYY-MM-DD.`);
  }
  return date;
}

function formatUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * `DATE_TRUNC(date, <grain>)` exactly as BigQuery computes it, so the buckets generated here carry
 * the same `bucket_date` the warehouse emits. BigQuery's `WEEK` starts on Sunday.
 */
export function truncateToGrain(date: string, grain: TimeGrain): string {
  if (!TIME_GRAINS.includes(grain)) {
    throw new MetricCompilerError(`Unknown time grain "${grain}".`);
  }
  const parsed = parseUtc(date);
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth();
  switch (grain) {
    case 'day':
      return formatUtc(parsed);
    case 'week':
      return formatUtc(new Date(parsed.getTime() - parsed.getUTCDay() * 86_400_000));
    case 'month':
      return formatUtc(new Date(Date.UTC(year, month, 1)));
    case 'quarter':
      return formatUtc(new Date(Date.UTC(year, month - (month % 3), 1)));
    case 'year':
      return formatUtc(new Date(Date.UTC(year, 0, 1)));
  }
}

function nextBucket(bucket: Date, grain: TimeGrain): Date {
  switch (grain) {
    case 'day':
      return new Date(bucket.getTime() + 86_400_000);
    case 'week':
      return new Date(bucket.getTime() + 7 * 86_400_000);
    case 'month':
      return new Date(Date.UTC(bucket.getUTCFullYear(), bucket.getUTCMonth() + 1, 1));
    case 'quarter':
      return new Date(Date.UTC(bucket.getUTCFullYear(), bucket.getUTCMonth() + 3, 1));
    case 'year':
      return new Date(Date.UTC(bucket.getUTCFullYear() + 1, 0, 1));
  }
}

/**
 * Every bucket a window covers at a grain, in order: from the bucket containing `start` to the one
 * containing `end`. Returns `null` instead of a list once it would exceed `limit`, so a caller can
 * cheaply refuse an oversized fill without materialising it first.
 */
export function listBucketDates(window: TimeWindow, grain: MetricQueryGrain, limit: number = MAX_FILLED_BUCKETS): string[] | null {
  if (grain === TOTAL_GRAIN) {
    // The whole window is one bucket, stamped with its start date - see `totalBucketExpression`.
    return [window.start];
  }
  const last = parseUtc(truncateToGrain(window.end, grain)).getTime();
  const buckets: string[] = [];
  for (let bucket = parseUtc(truncateToGrain(window.start, grain)); bucket.getTime() <= last; bucket = nextBucket(bucket, grain)) {
    if (buckets.length >= limit) {
      return null;
    }
    buckets.push(formatUtc(bucket));
  }
  return buckets;
}

type RowValue = string | number | null;
type Row = Record<string, RowValue>;

export interface FillEmptyBucketsOptions {
  /** The request's own time range - its window(s) and grain decide which buckets must exist. */
  time: MetricQueryTimeRange;
  /** The request's breakdown dimensions; every distinct combination seen is a series of its own. */
  dimensions: readonly string[];
  /** One entry per metric column in the rows (the request's own metric names). */
  metrics: Readonly<Record<string, EmptyBucketValue>>;
}

function bucketKey(value: RowValue | undefined): string | null {
  return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : null;
}

/**
 * Completes a compiled metric query's rows so every series has one row per bucket of the requested
 * range: a missing bucket gets a row with 0 for a `zero` metric and `null` for a `gap` metric (see
 * {@link EmptyBucketValue}). A `zero` metric's `null` in an existing row - a multi-metric query's
 * `FULL JOIN` yields one when another metric had rows that bucket and this one did not - becomes 0
 * for the same reason.
 *
 * What it deliberately leaves alone:
 * - A result with no rows at all stays empty, and so does a compared period with no rows. "Nothing
 *   was ever recorded here" is a different, more useful fact than a flat line at zero - tiles show
 *   their "No data yet" state for it, and goals report `hasMeasurements: false`.
 * - A series is a dimension combination seen *in that period*; values that never appear are not
 *   invented, because the warehouse is the only source of which values exist.
 * - Rows whose `bucket_date` is not one of the generated buckets are kept as they are.
 * - A range needing more than {@link MAX_FILLED_BUCKETS} buckets is returned untouched.
 *
 * The output is ordered like the compiled SQL's own `ORDER BY`: period, bucket, then dimensions.
 */
export function fillEmptyBuckets<T extends Row>(rows: readonly T[], options: FillEmptyBucketsOptions): T[] {
  if (rows.length === 0) {
    return [...rows];
  }
  const { current, previous } = computeCompareWindow(options.time);
  const periods: { name: string | null; window: TimeWindow }[] = previous
    ? [
        { name: 'current', window: current },
        { name: 'previous', window: previous },
      ]
    : [{ name: null, window: current }];

  const bucketsByPeriod = new Map<string | null, string[]>();
  for (const period of periods) {
    const buckets = listBucketDates(period.window, options.time.grain);
    if (buckets === null) {
      return [...rows];
    }
    bucketsByPeriod.set(period.name, buckets);
  }

  const metricEntries = Object.entries(options.metrics);
  const zeroedRow = (row: T): T => {
    let changed = false;
    const copy: Row = { ...row };
    for (const [metric, empty] of metricEntries) {
      if (empty === 'zero' && (copy[metric] === null || copy[metric] === undefined)) {
        copy[metric] = 0;
        changed = true;
      }
    }
    return changed ? (copy as T) : row;
  };

  const output: T[] = [];
  for (const period of periods) {
    const periodRows = rows.filter((row) => (period.name === null ? true : row.period === period.name));
    if (periodRows.length === 0) {
      continue;
    }
    const combos = new Map<string, Row>();
    const present = new Set<string>();
    for (const row of periodRows) {
      const dimensionValues: Row = {};
      for (const dimension of options.dimensions) {
        dimensionValues[dimension] = row[dimension] ?? null;
      }
      const comboKey = JSON.stringify(options.dimensions.map((dimension) => dimensionValues[dimension]));
      if (!combos.has(comboKey)) {
        combos.set(comboKey, dimensionValues);
      }
      const bucket = bucketKey(row.bucket_date);
      if (bucket !== null) {
        present.add(JSON.stringify([bucket, comboKey]));
      }
      output.push(zeroedRow(row));
    }
    for (const bucket of bucketsByPeriod.get(period.name) ?? []) {
      for (const [comboKey, dimensionValues] of combos) {
        if (present.has(JSON.stringify([bucket, comboKey]))) {
          continue;
        }
        const filled: Row = {
          ...(period.name !== null ? { period: period.name } : {}),
          bucket_date: bucket,
          ...dimensionValues,
        };
        for (const [metric, empty] of metricEntries) {
          filled[metric] = empty === 'zero' ? 0 : null;
        }
        output.push(filled as T);
      }
    }
  }
  // Rows of a compared query that carry neither period tag are not dropped.
  if (previous) {
    output.push(...rows.filter((row) => row.period !== 'current' && row.period !== 'previous'));
  }

  const sortKey = (row: Row) => [String(row.period ?? ''), String(row.bucket_date ?? ''), ...options.dimensions.map((dimension) => String(row[dimension] ?? ''))];
  return output
    .map((row, index) => ({ row, index, key: sortKey(row) }))
    .sort((a, b) => {
      for (let i = 0; i < a.key.length; i += 1) {
        const compared = a.key[i] < b.key[i] ? -1 : a.key[i] > b.key[i] ? 1 : 0;
        if (compared !== 0) {
          return compared;
        }
      }
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}
