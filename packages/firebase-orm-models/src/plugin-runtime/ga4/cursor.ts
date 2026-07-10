/** How many days of history to walk backward through on a from-scratch sync. Unlike Google Ads (KAN-50)'s 13-month AC bar, KAN-52 states no specific backfill window — 90 days is a reasonable default, adjustable later without a schema change (it only affects a fresh install's starting point). */
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
 * One report's own sync position: the next calendar day that has never been
 * fetched yet. GA4's Data API has no object-id pagination the way Stripe's
 * list endpoints do — reports are scoped to a calendar day, so "paging
 * through history" here means walking `nextDate` forward exactly one day per
 * `sync()` call, whether that call is catching up from a fresh install or
 * recovering from a gap between manual "Run now" clicks (no scheduler exists
 * yet, KAN-18) — the same one-day-at-a-time advance either way, so a week-long
 * gap between runs is walked through over the next several calls rather than
 * silently jumped over.
 *
 * A day, once fetched, is never re-fetched: `ingestBatch`'s dedup discards a
 * repeated `event_id` outright rather than merging/overwriting it (see
 * `mapSessionsReportToEventRecords`'s own doc comment), so re-polling a day
 * already landed would not actually pick up a late-arriving GA4 correction —
 * it would just waste an API call. `nextDate` only ever advances past
 * "yesterday" once "yesterday" itself has moved (i.e. real time has passed),
 * which naturally gives GA4 roughly a day of processing lag before its numbers
 * are captured — a documented, accepted limitation, not a promise that later
 * corrections are ever picked up (matching this codebase's posture on
 * accuracy bars that need a live account to verify, e.g. KAN-49/50/51's own
 * ±1% bars).
 */
export interface Ga4ResourceCursor {
  nextDate: string;
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
    sessions: { nextDate: start },
    events: { nextDate: start },
  };
}

export class InvalidGa4SyncCursorError extends Error {
  constructor() {
    super('Persisted GA4 sync cursor is not valid JSON in the expected shape.');
    this.name = 'InvalidGa4SyncCursorError';
  }
}

function isResourceCursor(value: unknown): value is Ga4ResourceCursor {
  return typeof value === 'object' && value !== null && typeof (value as Ga4ResourceCursor).nextDate === 'string';
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
