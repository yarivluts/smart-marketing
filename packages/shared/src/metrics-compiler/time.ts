import { COMPARE_PERIODS, MetricCompilerError, TIME_GRAINS, type MetricQueryTimeRange, type TimeGrain } from './types';

export interface TimeWindow {
  start: string;
  end: string;
}

const GRAIN_TO_BQ_DATE_PART: Record<TimeGrain, string> = {
  day: 'DAY',
  week: 'WEEK',
  month: 'MONTH',
  quarter: 'QUARTER',
  year: 'YEAR',
};

/** Buckets a (already-quoted) timestamp/date column expression to the requested grain, e.g. `DATE_TRUNC(DATE(\`ts\`), WEEK)`. */
export function bucketExpression(timeColumnSql: string, grain: TimeGrain): string {
  if (!TIME_GRAINS.includes(grain)) {
    throw new MetricCompilerError(`Unknown time grain "${grain}".`);
  }
  return `DATE_TRUNC(DATE(${timeColumnSql}), ${GRAIN_TO_BQ_DATE_PART[grain]})`;
}

function parseDateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new MetricCompilerError(`Invalid date "${value}" — expected YYYY-MM-DD.`);
  }
  return date;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function addYearsUtc(date: Date, years: number): Date {
  const result = new Date(date.getTime());
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return result;
}

/**
 * Resolves a query's requested time range into the window(s) it needs: just
 * `current` with no `compare`, or `current` + `previous` when one is set.
 * - `previous_period`: the same-length window immediately preceding `start`.
 * - `previous_year`: the identical `start`/`end` shifted back one calendar year.
 */
export function computeCompareWindow(time: MetricQueryTimeRange): { current: TimeWindow; previous?: TimeWindow } {
  const start = parseDateOnly(time.start);
  const end = parseDateOnly(time.end);
  if (end.getTime() < start.getTime()) {
    throw new MetricCompilerError(`Time range end "${time.end}" is before start "${time.start}".`);
  }

  const current = { start: time.start, end: time.end };
  if (time.compare === undefined) {
    return { current };
  }
  if (!COMPARE_PERIODS.includes(time.compare)) {
    throw new MetricCompilerError(`Unknown compare period "${time.compare}".`);
  }

  if (time.compare === 'previous_year') {
    return { current, previous: { start: formatDateOnly(addYearsUtc(start, -1)), end: formatDateOnly(addYearsUtc(end, -1)) } };
  }

  const lengthDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const previousEnd = addDaysUtc(start, -1);
  const previousStart = addDaysUtc(previousEnd, -(lengthDays - 1));
  return { current, previous: { start: formatDateOnly(previousStart), end: formatDateOnly(previousEnd) } };
}
