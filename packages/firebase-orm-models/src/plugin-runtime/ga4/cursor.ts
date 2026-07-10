/** How many days of history to walk backward through on a from-scratch sync, before switching to daily polling of "yesterday". Unlike Google Ads (KAN-50)'s 13-month AC bar, KAN-52 states no specific backfill window — 90 days is a reasonable default, adjustable later without a schema change (it only affects a fresh install's starting point). */
export const DEFAULT_GA4_BACKFILL_DAYS = 90;

/** Formats a `Date` as a UTC calendar day, `YYYY-MM-DD` — the same granularity GA4 reports are scoped to. */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Adds (or subtracts, for a negative `days`) whole UTC calendar days to a `YYYY-MM-DD` string. */
export function addDaysUtc(dateString: string, days: number): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return toDateString(shifted);
}

/**
 * One report's own backfill/incremental progress. GA4's Data API has no
 * object-id pagination the way Stripe's list endpoints do — reports are
 * scoped to a calendar day, so "paging through history" here means walking
 * `nextDate` forward one day per `sync()` call until it reaches yesterday
 * (GA4 never has complete same-day data), then re-fetching yesterday on
 * every subsequent call to pick up late-arriving data — the same
 * "re-fetch the same boundary, harmless via ingest dedup" posture
 * `StripeResourceCursor`'s `created[gte]` polling already established.
 */
export interface Ga4ResourceCursor {
  nextDate: string;
  backfillComplete: boolean;
}

/**
 * The whole connector's persisted sync position, JSON-encoded into
 * `PluginInstallModel.source_cursor`. Unlike Stripe's cursor, no `phase` is
 * needed — both GA4 reports this connector fetches (`sessions`, `events`)
 * land as `kind: 'event'` records, so a single `sync()` call fetches both
 * every time (see `executor.ts`), each tracking its own independent
 * day-pointer.
 */
export interface Ga4SyncCursor {
  sessions: Ga4ResourceCursor;
  events: Ga4ResourceCursor;
}

export function initialGa4SyncCursor(today: string, backfillDays: number = DEFAULT_GA4_BACKFILL_DAYS): Ga4SyncCursor {
  const start = addDaysUtc(today, -backfillDays);
  return {
    sessions: { nextDate: start, backfillComplete: false },
    events: { nextDate: start, backfillComplete: false },
  };
}

export class InvalidGa4SyncCursorError extends Error {
  constructor() {
    super('Persisted GA4 sync cursor is not valid JSON in the expected shape.');
    this.name = 'InvalidGa4SyncCursorError';
  }
}

function isResourceCursor(value: unknown): value is Ga4ResourceCursor {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Ga4ResourceCursor).nextDate === 'string' &&
    typeof (value as Ga4ResourceCursor).backfillComplete === 'boolean'
  );
}

/** Parses a persisted cursor string, or returns a fresh one for `null` ("sync from scratch" — this install has never completed a sync before). */
export function parseGa4SyncCursor(raw: string | null, today: string, backfillDays: number = DEFAULT_GA4_BACKFILL_DAYS): Ga4SyncCursor {
  if (raw === null) {
    return initialGa4SyncCursor(today, backfillDays);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidGa4SyncCursorError();
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !isResourceCursor((parsed as Ga4SyncCursor).sessions) ||
    !isResourceCursor((parsed as Ga4SyncCursor).events)
  ) {
    throw new InvalidGa4SyncCursorError();
  }
  return parsed as Ga4SyncCursor;
}

export function serializeGa4SyncCursor(cursor: Ga4SyncCursor): string {
  return JSON.stringify(cursor);
}
