/**
 * What a metric's numbers mean (KAN-213). A metric definition used to carry no unit at all, so a
 * 0-1 conversion fraction and a count of signups looked the same to every consumer: a board tile
 * printed "0.5" for a 50% conversion rate, and a goal "lift conversion to 8%" was saved with a target
 * of 8 against a fraction - 800%, a goal that could never be met.
 *
 * A unit is declared, never inferred: a formula's shape does not say whether its value is bounded
 * (`lp_conversions / lp_visitors` is a 0-1 fraction, `collection_40d / ad_spend` is a ROI that
 * routinely exceeds 1), so only the metric's author can say. An undeclared unit is treated exactly as
 * `number`, which is how every value displayed before units existed.
 *
 * Stored form (`MetricDefModel.unit`) is one short string, so it reads the same in Firestore, in an
 * MCP call and in a form: a unit kind, or `currency:XXX` for a currency pinned to an ISO 4217 code.
 * A bare `currency` means "the project's own currency".
 */

export const METRIC_UNIT_KINDS = ['number', 'count', 'ratio', 'percent', 'currency', 'duration_seconds'] as const;
export type MetricUnitKind = (typeof METRIC_UNIT_KINDS)[number];

/** A stored unit string: a kind, or `currency:XXX` for a fixed ISO 4217 currency. */
export type MetricUnit = MetricUnitKind | `currency:${string}`;

/** A parsed unit. `currency` is the ISO 4217 code, when the unit (or the project) supplies one. */
export interface ParsedMetricUnit {
  kind: MetricUnitKind;
  currency?: string;
}

const CURRENCY_CODE = /^[A-Z]{3}$/;
const CURRENCY_PREFIX = 'currency:';

export function isMetricUnitKind(value: string): value is MetricUnitKind {
  return (METRIC_UNIT_KINDS as readonly string[]).includes(value);
}

/** Parses a stored or submitted unit string. Returns `null` for anything that is not a valid unit. Currency codes are accepted in any case and returned upper-case. */
export function parseMetricUnit(raw: string): ParsedMetricUnit | null {
  const value = raw.trim();
  if (isMetricUnitKind(value)) {
    return { kind: value };
  }
  if (value.startsWith(CURRENCY_PREFIX)) {
    const code = value.slice(CURRENCY_PREFIX.length).trim().toUpperCase();
    return CURRENCY_CODE.test(code) ? { kind: 'currency', currency: code } : null;
  }
  return null;
}

/** The canonical stored string for a parsed unit. */
export function serializeMetricUnit(unit: ParsedMetricUnit): MetricUnit {
  return unit.kind === 'currency' && unit.currency ? `currency:${unit.currency}` : unit.kind;
}

/**
 * Validates a caller-supplied unit for registration/evolution. `undefined`/`null`/an empty string
 * means "no unit declared" (a plain number). Returns the canonical string, or a human-readable
 * reason the value was refused.
 */
export function normalizeMetricUnitInput(raw: unknown): { ok: true; unit: MetricUnit | undefined } | { ok: false; reason: string } {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim().length === 0)) {
    return { ok: true, unit: undefined };
  }
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'A metric unit must be a string.' };
  }
  const parsed = parseMetricUnit(raw);
  if (!parsed) {
    return {
      ok: false,
      reason: `Unknown metric unit "${raw}". Use one of ${METRIC_UNIT_KINDS.join(', ')}, or "currency:XXX" with a three-letter ISO 4217 code (e.g. "currency:USD").`,
    };
  }
  return { ok: true, unit: serializeMetricUnit(parsed) };
}

/**
 * The unit to display a value in: an absent or unreadable unit is `number` (the pre-unit behaviour),
 * and a bare `currency` takes the project's currency when it has one.
 */
export function resolveMetricUnit(unit: string | undefined | null, projectCurrency?: string | null): ParsedMetricUnit {
  const parsed = unit ? parseMetricUnit(unit) : null;
  if (!parsed) {
    return { kind: 'number' };
  }
  if (parsed.kind === 'currency' && !parsed.currency) {
    const code = projectCurrency?.trim().toUpperCase();
    return code && CURRENCY_CODE.test(code) ? { kind: 'currency', currency: code } : { kind: 'currency' };
  }
  return parsed;
}

const SECONDS_PER = { minute: 60, hour: 3600, day: 86400 } as const;

function formatDuration(seconds: number, locale: string | undefined): string {
  const magnitude = Math.abs(seconds);
  const [unit, divisor] =
    magnitude >= SECONDS_PER.day
      ? (['day', SECONDS_PER.day] as const)
      : magnitude >= SECONDS_PER.hour
        ? (['hour', SECONDS_PER.hour] as const)
        : magnitude >= SECONDS_PER.minute
          ? (['minute', SECONDS_PER.minute] as const)
          : (['second', 1] as const);
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 1 }).format(seconds / divisor);
}

/**
 * Formats one metric value for display in its unit, in the viewer's locale: a `ratio` of 0.5 is
 * "50%", a `percent` of 8 is "8%", a `currency` value carries its symbol, and a `duration_seconds`
 * value is scaled to the largest whole unit ("1.5 hr"). `number`/`count` (and no unit) keep the
 * pre-unit display: grouped, at most two decimals. A `currency` with no known code has no symbol to
 * show, so it is formatted as a plain number rather than guessing one.
 */
export function formatMetricValue(value: number, unit?: ParsedMetricUnit | string | null, locale?: string): string {
  const parsed = typeof unit === 'string' || unit === null || unit === undefined ? resolveMetricUnit(unit) : unit;
  switch (parsed.kind) {
    case 'ratio':
      return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(value);
    case 'percent':
      return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(value / 100);
    case 'currency':
      return parsed.currency
        ? new Intl.NumberFormat(locale, { style: 'currency', currency: parsed.currency, maximumFractionDigits: 2 }).format(value)
        : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
    case 'duration_seconds':
      return formatDuration(value, locale);
    default:
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  }
}

/**
 * The range a value in this unit can meaningfully take, as stored: a fraction lies in 0..1, a
 * percent in 0..100, a count or a duration is never negative. `number` and `currency` are unbounded
 * (a net-churn amount can be negative). Used to refuse goal targets that could never be reached.
 */
export function metricUnitValueRange(unit: ParsedMetricUnit | string | null | undefined): { min?: number; max?: number } {
  const kind = (typeof unit === 'string' || unit === null || unit === undefined ? resolveMetricUnit(unit) : unit).kind;
  switch (kind) {
    case 'ratio':
      return { min: 0, max: 1 };
    case 'percent':
      return { min: 0, max: 100 };
    case 'count':
    case 'duration_seconds':
      return { min: 0 };
    default:
      return {};
  }
}

/**
 * How a goal target is typed in a form versus stored: a `ratio` target is entered as a percent
 * ("8" for 8%) and stored as a fraction (0.08); every other unit is entered as stored.
 */
export function goalTargetEntryScale(unit: ParsedMetricUnit | string | null | undefined): number {
  const kind = (typeof unit === 'string' || unit === null || unit === undefined ? resolveMetricUnit(unit) : unit).kind;
  return kind === 'ratio' ? 100 : 1;
}

/** An entered (form) goal target converted to its stored value. Rounded to avoid float noise such as 0.07 * 100 = 7.000000000000001. */
export function goalTargetFromEntry(entered: number, unit: ParsedMetricUnit | string | null | undefined): number {
  const scale = goalTargetEntryScale(unit);
  return scale === 1 ? entered : Number((entered / scale).toPrecision(12));
}

/** A stored goal target converted to the value a form shows for editing. */
export function goalTargetToEntry(stored: number, unit: ParsedMetricUnit | string | null | undefined): number {
  const scale = goalTargetEntryScale(unit);
  return scale === 1 ? stored : Number((stored * scale).toPrecision(12));
}

/**
 * Why a stored goal target (or range bound) is impossible for a metric's unit, or `null` when it is
 * fine. The message names the unit and, for a fraction, the value the caller most likely meant -
 * a target of 8 on a 0-1 conversion rate is almost always "8%", i.e. 0.08.
 */
export function goalTargetUnitProblem(label: string, stored: number, unit: ParsedMetricUnit | string | null | undefined): string | null {
  const parsed = typeof unit === 'string' || unit === null || unit === undefined ? resolveMetricUnit(unit) : unit;
  const { min, max } = metricUnitValueRange(parsed);
  if ((min === undefined || stored >= min) && (max === undefined || stored <= max)) {
    return null;
  }
  if (parsed.kind === 'ratio') {
    const hint = stored > 1 && stored <= 100 ? ` For ${stored}%, use ${goalTargetFromEntry(stored, parsed)}.` : '';
    return `${label} ${stored} is outside the metric's range: it is a ratio (a 0-1 fraction shown as a percent), so the value must be between 0 and 1.${hint}`;
  }
  if (parsed.kind === 'percent') {
    return `${label} ${stored} is outside the metric's range: it is a percent, so the value must be between 0 and 100.`;
  }
  return `${label} ${stored} is outside the metric's range: a ${parsed.kind === 'count' ? 'count' : 'duration'} cannot be negative.`;
}
