import { TIME_GRAINS, type TimeGrain } from './types';

/**
 * A stored date-range *setting* (KAN-211) - what a board (or any other saved view) keeps, as
 * opposed to the concrete `start`/`end` a query runs over. Two kinds:
 *
 * - `absolute`: fixed calendar dates. Right for "Q3 launch retrospective", wrong as a default: a
 *   board seeded on 2026-08-01 with 2026-07-03..2026-08-01 shows "No data" on every tile a month
 *   later, because the window never moves.
 * - `relative`: a named preset ("last 30 days") resolved against today's UTC date every time the
 *   range is read, so the window rolls forward on its own.
 *
 * `kind` is optional on the absolute shape so every document written before relative ranges existed
 * (`{ start, end, grain }` with no `kind`) keeps its exact meaning when read back.
 */
export const RELATIVE_DATE_PRESETS = [
  'last_7_days',
  'last_14_days',
  'last_30_days',
  'last_90_days',
  'last_365_days',
  'month_to_date',
  'last_month',
  'quarter_to_date',
  'year_to_date',
] as const;
export type RelativeDatePreset = (typeof RELATIVE_DATE_PRESETS)[number];

export function isRelativeDatePreset(value: unknown): value is RelativeDatePreset {
  return typeof value === 'string' && (RELATIVE_DATE_PRESETS as readonly string[]).includes(value);
}

export interface AbsoluteDateRangeSetting {
  kind?: 'absolute';
  /** Inclusive, `YYYY-MM-DD`. */
  start: string;
  /** Inclusive, `YYYY-MM-DD`. */
  end: string;
  grain: TimeGrain;
}

export interface RelativeDateRangeSetting {
  kind: 'relative';
  preset: RelativeDatePreset;
  grain: TimeGrain;
}

export type DateRangeSetting = AbsoluteDateRangeSetting | RelativeDateRangeSetting;

/** A setting resolved to the concrete, inclusive window a query runs over. */
export interface ResolvedDateRange {
  start: string;
  end: string;
  grain: TimeGrain;
}

/** The default for anything newly created: a rolling trailing 30 days, bucketed by day. */
export const DEFAULT_RELATIVE_DATE_RANGE: RelativeDateRangeSetting = { kind: 'relative', preset: 'last_30_days', grain: 'day' };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in `YYYY-MM-DD` form (rejects `2026-02-30`, which `Date` would roll into March). */
export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isTimeGrain(value: unknown): value is TimeGrain {
  return typeof value === 'string' && (TIME_GRAINS as readonly string[]).includes(value);
}

/** Today's calendar date in UTC - the "today" every relative preset resolves against, so a board reads the same window whichever server region renders it. */
export function todayUtcDateOnly(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function parseUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

/**
 * Resolves a preset against `today` (a `YYYY-MM-DD` UTC date). Every "last N days" / "to date"
 * preset ends today, inclusive, so "last 7 days" is today plus the six days before it - the same
 * "trailing N days including today" convention the old fixed default (`start = today - 29`) used.
 * `last_month` is the one preset that ends before today: the previous full calendar month.
 */
export function resolveRelativeDatePreset(preset: RelativeDatePreset, today: string): { start: string; end: string } {
  if (!isDateOnly(today)) {
    throw new Error(`Invalid reference date "${today}" - expected YYYY-MM-DD.`);
  }
  const end = parseUtc(today);
  const year = end.getUTCFullYear();
  const month = end.getUTCMonth();
  const trailing = (days: number) => ({ start: formatUtc(new Date(end.getTime() - (days - 1) * 86_400_000)), end: today });

  switch (preset) {
    case 'last_7_days':
      return trailing(7);
    case 'last_14_days':
      return trailing(14);
    case 'last_30_days':
      return trailing(30);
    case 'last_90_days':
      return trailing(90);
    case 'last_365_days':
      return trailing(365);
    case 'month_to_date':
      return { start: formatUtc(utcDate(year, month, 1)), end: today };
    case 'last_month':
      // Day 0 of this month is the last day of the previous one; Date.UTC normalises month -1 to December.
      return { start: formatUtc(utcDate(year, month - 1, 1)), end: formatUtc(utcDate(year, month, 0)) };
    case 'quarter_to_date':
      return { start: formatUtc(utcDate(year, month - (month % 3), 1)), end: today };
    case 'year_to_date':
      return { start: formatUtc(utcDate(year, 0, 1)), end: today };
  }
}

/** The concrete window a stored setting means today. An absolute setting passes through unchanged. */
export function resolveDateRangeSetting(setting: DateRangeSetting, today: string = todayUtcDateOnly()): ResolvedDateRange {
  if (setting.kind === 'relative') {
    return { ...resolveRelativeDatePreset(setting.preset, today), grain: setting.grain };
  }
  return { start: setting.start, end: setting.end, grain: setting.grain };
}

/**
 * Reads a stored or submitted date-range setting defensively. Accepts the legacy `{ start, end,
 * grain }` shape (no `kind`) as absolute, so every pre-KAN-211 document keeps its meaning; returns
 * `null` for anything unrecognisable rather than guessing. The result always carries an explicit
 * `kind` and nothing but the fields of its kind, so writing it back never leaves a stale `start`
 * on a relative range or a stale `preset` on an absolute one.
 */
export function normalizeDateRangeSetting(raw: unknown): DateRangeSetting | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (!isTimeGrain(record.grain)) {
    return null;
  }
  if (record.kind === 'relative') {
    return isRelativeDatePreset(record.preset) ? { kind: 'relative', preset: record.preset, grain: record.grain } : null;
  }
  if (record.kind !== undefined && record.kind !== 'absolute') {
    return null;
  }
  if (typeof record.start !== 'string' || typeof record.end !== 'string') {
    return null;
  }
  return { kind: 'absolute', start: record.start, end: record.end, grain: record.grain };
}

/** Why a setting is unusable, or `null` when it is fine: a relative preset always resolves, an absolute one needs two real dates in order. */
export function describeInvalidDateRangeSetting(setting: DateRangeSetting): string | null {
  if (setting.kind === 'relative') {
    return null;
  }
  if (!isDateOnly(setting.start) || !isDateOnly(setting.end)) {
    return 'The date range start and end must be real dates in YYYY-MM-DD form.';
  }
  if (setting.start > setting.end) {
    return 'The date range start must not be after its end.';
  }
  return null;
}
