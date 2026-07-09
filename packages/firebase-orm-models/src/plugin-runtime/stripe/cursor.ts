/** One resource type's own backfill/incremental progress. */
export interface StripeResourceCursor {
  /** A Stripe object id to page `starting_after` — set while backfill is still paging through history; `null` once caught up. */
  backfillCursor: string | null;
  /** Whether this resource has ever reached the end of its history (`has_more: false`) — once true, future syncs only fetch `created >= lastSyncedCreated`. */
  backfillComplete: boolean;
  /** Unix-seconds high-water mark of the newest `created` this resource has fully synced — `null` until the first page lands. */
  lastSyncedCreated: number | null;
}

/**
 * The whole connector's persisted sync position, JSON-encoded into
 * `PluginInstallModel.source_cursor` (the one cursor string the generic
 * `SourcePluginExecutor` interface supports). `phase` alternates which
 * `IngestBatchInput.kind` the *next* `sync()` call produces — `SourcePluginSyncResult`
 * carries a single, homogeneous `kind`, so one call can't emit both `event`
 * and `entity` records; alternating phases lets one executor still cover
 * both without changing that shared interface. `events` bundles
 * charges/invoices/refunds (all `kind: 'event'`, each record naming its own
 * schema) into one phase; `entities` covers subscriptions alone.
 */
export interface StripeSyncCursor {
  phase: 'events' | 'entities';
  events: { charge: StripeResourceCursor; invoice: StripeResourceCursor; refund: StripeResourceCursor };
  entities: { subscription: StripeResourceCursor };
}

function freshResourceCursor(): StripeResourceCursor {
  return { backfillCursor: null, backfillComplete: false, lastSyncedCreated: null };
}

export function initialStripeSyncCursor(): StripeSyncCursor {
  return {
    phase: 'events',
    events: { charge: freshResourceCursor(), invoice: freshResourceCursor(), refund: freshResourceCursor() },
    entities: { subscription: freshResourceCursor() },
  };
}

export class InvalidStripeSyncCursorError extends Error {
  constructor() {
    super('Persisted Stripe sync cursor is not valid JSON in the expected shape.');
    this.name = 'InvalidStripeSyncCursorError';
  }
}

/** Parses a persisted cursor string, or returns a fresh one for `null` ("sync from scratch" — this install has never completed a sync before). */
export function parseStripeSyncCursor(raw: string | null): StripeSyncCursor {
  if (raw === null) {
    return initialStripeSyncCursor();
  }
  try {
    const parsed = JSON.parse(raw) as StripeSyncCursor;
    if (
      (parsed.phase !== 'events' && parsed.phase !== 'entities') ||
      !parsed.events?.charge ||
      !parsed.events?.invoice ||
      !parsed.events?.refund ||
      !parsed.entities?.subscription
    ) {
      throw new InvalidStripeSyncCursorError();
    }
    return parsed;
  } catch {
    throw new InvalidStripeSyncCursorError();
  }
}

export function serializeStripeSyncCursor(cursor: StripeSyncCursor): string {
  return JSON.stringify(cursor);
}
