import { randomUUID } from 'node:crypto';
import { DEFAULT_BASE_URL, SDK_VERSION, envBaseUrl } from './constants.js';
import { defaultSleep, request, type HttpOptions } from './http.js';
import {
  GrowthOSError,
  type BatchResult,
  type EntityRecord,
  type EventRecord,
  type Fields,
  type FlushResult,
  type InstallationVerification,
  type MeasureInput,
  type MeasureRecord,
  type RejectedRecord,
  type TrackInput,
  type ValidationResult,
} from './types.js';

export { DEFAULT_BASE_URL, SDK_VERSION } from './constants.js';
/** The API's own limit per batch. */
export const MAX_BATCH_SIZE = 1000;

export interface GrowthOSOptions {
  /** A secret server key (gos_live_... / gos_test_...) with the ingest.write scope. The key decides the project and environment. */
  apiKey: string;
  /** The GrowthOS API, without /v1. Defaults to GROWTHOS_BASE_URL or the production API. */
  baseUrl?: string;
  /** Queued records are sent once this many are waiting (default 100, at most 1000). */
  flushAt?: number;
  /** ...or this long after the first one was queued (default 5000 ms). 0 sends only on flush(). */
  flushIntervalMs?: number;
  /** Retries per batch on 429, 5xx and network errors (default 5). */
  maxRetries?: number;
  /** Per request (default 10000 ms). */
  timeoutMs?: number;
  /** Called with every delivered batch - log `rejected` here to see quarantined records. */
  onResult?: (result: BatchResult) => void;
  /** Called when a batch could not be delivered after every retry. Default: console.error. */
  onError?: (error: GrowthOSError) => void;
  /** Nothing is sent (tests, local runs); calls still resolve. */
  disabled?: boolean;
  /** Replaceable for tests. */
  fetch?: typeof fetch;
}

type Queued =
  | { kind: 'event'; record: EventRecord }
  | { kind: 'entity'; type: string; record: EntityRecord }
  | { kind: 'measure'; record: MeasureRecord };

function iso(value: Date | string | undefined): string {
  if (value === undefined) return new Date().toISOString();
  return typeof value === 'string' ? value : value.toISOString();
}

interface RawBatch {
  batch_id: string;
  kind: BatchResult['kind'];
  accepted: number;
  quarantined: number;
  duplicates: number;
  total: number;
  rejected?: { client_id: string; status: RejectedRecord['status']; reasons?: string[] }[];
}

function toBatchResult(raw: RawBatch): BatchResult {
  return {
    batchId: raw.batch_id,
    kind: raw.kind,
    accepted: raw.accepted,
    quarantined: raw.quarantined,
    duplicates: raw.duplicates,
    total: raw.total,
    rejected: (raw.rejected ?? []).map((record) => ({
      clientId: record.client_id,
      status: record.status,
      reasons: record.reasons ?? [],
    })),
  };
}

function sumResults(batches: BatchResult[], errors: GrowthOSError[]): FlushResult {
  const sum = (field: 'accepted' | 'quarantined' | 'duplicates') =>
    batches.reduce((total, batch) => total + batch[field], 0);
  return {
    ok: errors.length === 0 && batches.every((batch) => batch.quarantined === 0),
    batches,
    accepted: sum('accepted'),
    quarantined: sum('quarantined'),
    duplicates: sum('duplicates'),
    rejected: batches.flatMap((batch) => batch.rejected),
    errors,
  };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size));
  return chunks;
}

/**
 * The GrowthOS client for servers. Queue records with `track` / `entity` / `customer` / `measure`
 * (sent in batches on a timer or when `flushAt` are waiting), or send right away with `send*` and
 * read what happened to each record. Call `shutdown()` before the process exits.
 *
 * ```ts
 * const growthos = new GrowthOS({ apiKey: process.env.GROWTHOS_API_KEY! });
 * growthos.track({ event: 'signup', eventId: eventId('signup', user.id), customerId: user.id, anonId, properties: { plan: 'free' } });
 * growthos.customer(user.id, { plan: 'free', created_at: user.createdAt });
 * await growthos.shutdown();
 * ```
 */
export class GrowthOS {
  private readonly http: HttpOptions;
  private readonly flushAt: number;
  private readonly flushIntervalMs: number;
  private readonly onResult?: (result: BatchResult) => void;
  private readonly onError: (error: GrowthOSError) => void;
  private readonly disabled: boolean;
  private queue: Queued[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<FlushResult> | null = null;
  private readonly extraHeaders: Record<string, string>;

  constructor(options: GrowthOSOptions, extraHeaders: Record<string, string> = {}) {
    if (!options.apiKey)
      throw new Error('GrowthOS: apiKey is required (a server key with the ingest.write scope).');
    if (options.apiKey.startsWith('gos_pk_')) {
      throw new Error(
        'GrowthOS: this is a publishable (browser) key. On a server use a secret key (gos_live_... / gos_test_...); publishable keys only work from a web page.',
      );
    }
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl)
      throw new Error(
        'GrowthOS: no fetch available - use Node.js 18 or later, or pass options.fetch.',
      );
    this.http = {
      baseUrl: options.baseUrl ?? envBaseUrl() ?? DEFAULT_BASE_URL,
      apiKey: options.apiKey,
      timeoutMs: options.timeoutMs ?? 10_000,
      maxRetries: options.maxRetries ?? 5,
      fetch: fetchImpl,
      sleep: defaultSleep,
      userAgent: `growthos-node/${SDK_VERSION}`,
    };
    this.flushAt = Math.min(Math.max(1, options.flushAt ?? 100), MAX_BATCH_SIZE);
    this.flushIntervalMs = options.flushIntervalMs ?? 5000;
    this.onResult = options.onResult;
    this.onError = options.onError ?? ((error) => console.error(`[growthos] ${error.message}`));
    this.disabled = options.disabled ?? false;
    this.extraHeaders = extraHeaders;
  }

  /** For tests: the sleep between retries. */
  setSleep(sleep: (ms: number) => Promise<void>): void {
    this.http.sleep = sleep;
  }

  // ---- Queued sending -------------------------------------------------------------------------

  /** Queues an event. Identity goes inside properties, as the ingest contract requires. */
  track(input: TrackInput): void {
    this.enqueue({ kind: 'event', record: GrowthOS.eventRecord(input) });
  }

  /** Queues an upsert of a WHOLE entity row: send every attribute each time, not just the changed ones. */
  entity(type: string, id: string, attributes: Fields): void {
    this.enqueue({ kind: 'entity', type, record: { id, attributes } });
  }

  /** `entity('customer', ...)`: the customer row reports and identity stitching read. */
  customer(id: string, attributes: Fields): void {
    this.entity('customer', id, attributes);
  }

  /** Queues a pre-aggregated measure, e.g. a day's ad spend. */
  measure(input: MeasureInput): void {
    this.enqueue({
      kind: 'measure',
      record: {
        measure: input.measure,
        ts: iso(input.ts),
        value: input.value,
        dimensions: input.dimensions ?? {},
      },
    });
  }

  /** Sends everything queued now and resolves with what happened to it. Never throws: failures are in `errors`. */
  async flush(): Promise<FlushResult> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // One flush at a time, in order: a second caller waits for the first, then sends what is left.
    while (this.inFlight) await this.inFlight;
    const pending = this.queue;
    this.queue = [];
    if (pending.length === 0) return sumResults([], []);
    this.inFlight = this.sendQueued(pending);
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  /** Flushes and stops the timer. Call before the process exits (e.g. at the end of a serverless function). */
  async shutdown(): Promise<FlushResult> {
    return this.flush();
  }

  // ---- Immediate sending ----------------------------------------------------------------------

  /** Sends events now (in batches of up to 1000) and returns what happened to each. Throws a GrowthOSError when a batch cannot be delivered. */
  async sendEvents(events: TrackInput[]): Promise<FlushResult> {
    return this.sendNow(
      events.map((input) => ({ kind: 'event' as const, record: GrowthOS.eventRecord(input) })),
      true,
    );
  }

  async sendEntities(type: string, records: EntityRecord[]): Promise<FlushResult> {
    return this.sendNow(
      records.map((record) => ({ kind: 'entity' as const, type, record })),
      true,
    );
  }

  async sendMeasures(measures: MeasureInput[]): Promise<FlushResult> {
    return this.sendNow(
      measures.map((input) => ({
        kind: 'measure' as const,
        record: {
          measure: input.measure,
          ts: iso(input.ts),
          value: input.value,
          dimensions: input.dimensions ?? {},
        },
      })),
      true,
    );
  }

  // ---- Checks ---------------------------------------------------------------------------------

  /** What ingest would do with these events - same checks, nothing stored. For CI conformance tests. */
  async validateEvents(events: TrackInput[]): Promise<ValidationResult> {
    return this.validate('events', { batch: events.map((input) => GrowthOS.eventRecord(input)) });
  }

  async validateEntities(type: string, records: EntityRecord[]): Promise<ValidationResult> {
    return this.validate('entities', { type, records });
  }

  async validateMeasures(measures: MeasureInput[]): Promise<ValidationResult> {
    return this.validate('measures', {
      records: measures.map((input) => ({
        measure: input.measure,
        ts: iso(input.ts),
        value: input.value,
        dimensions: input.dimensions ?? {},
      })),
    });
  }

  /**
   * The installation check: which project and environment this key writes to and, from real
   * records only, how each expected schema is doing there (receiving, stale, quarantined,
   * registered_no_data, not_registered) with the fix. Without `expect`, every schema.
   */
  async verify(options: { expect?: string[] } = {}): Promise<InstallationVerification> {
    const query = options.expect?.length
      ? `?expect=${encodeURIComponent(options.expect.join(','))}`
      : '';
    return request<InstallationVerification>(this.http, 'GET', `/v1/ingest/verify${query}`);
  }

  // ---- Backfill -------------------------------------------------------------------------------

  /**
   * A client whose batches are tagged to a backfill GrowthOS requested (header
   * X-GrowthOS-Backfill-Id), so the backfill's progress counts them. Finish with `completeBackfill`.
   */
  forBackfill(backfillId: string): GrowthOS {
    return new GrowthOS(
      {
        apiKey: this.http.apiKey,
        baseUrl: this.http.baseUrl,
        flushAt: this.flushAt,
        flushIntervalMs: this.flushIntervalMs,
        maxRetries: this.http.maxRetries,
        timeoutMs: this.http.timeoutMs,
        onResult: this.onResult,
        onError: this.onError,
        disabled: this.disabled,
        fetch: this.http.fetch,
      },
      { ...this.extraHeaders, 'X-GrowthOS-Backfill-Id': backfillId },
    );
  }

  /** Reports that a backfill finished (or failed), with what was sent. */
  async completeBackfill(
    backfillId: string,
    report: {
      status: 'completed' | 'failed';
      recordsSent: number;
      batches: number;
      errors?: { message: string }[];
    },
  ): Promise<void> {
    await request(this.http, 'POST', `/v1/backfills/${encodeURIComponent(backfillId)}/complete`, {
      status: report.status,
      records_sent: report.recordsSent,
      batches: report.batches,
      ...(report.errors?.length ? { errors: report.errors } : {}),
    });
  }

  // ---- Internals ------------------------------------------------------------------------------

  /** The wire record for an event: identity inside properties, an id and a source time. */
  static eventRecord(input: TrackInput): EventRecord {
    if (!input.event) throw new Error('GrowthOS: track() needs an event name.');
    return {
      event_id: input.eventId ?? randomUUID(),
      event: input.event,
      ts: iso(input.ts),
      properties: {
        ...(input.properties ?? {}),
        ...(input.anonId ? { anon_id: input.anonId } : {}),
        ...(input.customerId ? { customer_id: input.customerId } : {}),
      },
    };
  }

  private enqueue(item: Queued): void {
    if (this.disabled) return;
    this.queue.push(item);
    if (this.queue.length >= this.flushAt) {
      void this.flush();
    } else if (!this.timer && this.flushIntervalMs > 0) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, this.flushIntervalMs);
      // Never keep a process alive just for the timer: shutdown() is what guarantees delivery.
      this.timer.unref?.();
    }
  }

  private async sendQueued(items: Queued[]): Promise<FlushResult> {
    return this.sendNow(items, false);
  }

  /** Groups by kind (and entity type), splits into API-sized batches and sends each. */
  private async sendNow(items: Queued[], throwOnError: boolean): Promise<FlushResult> {
    if (this.disabled || items.length === 0) return sumResults([], []);
    const groups = new Map<
      string,
      { path: string; body: (records: unknown[]) => unknown; records: unknown[] }
    >();
    for (const item of items) {
      const key = item.kind === 'entity' ? `entity:${item.type}` : item.kind;
      const group =
        groups.get(key) ??
        (item.kind === 'event'
          ? {
              path: '/v1/ingest/events',
              body: (records: unknown[]) => ({ batch: records }),
              records: [],
            }
          : item.kind === 'entity'
            ? {
                path: '/v1/ingest/entities',
                body: (records: unknown[]) => ({ type: item.type, records }),
                records: [],
              }
            : {
                path: '/v1/ingest/measures',
                body: (records: unknown[]) => ({ records }),
                records: [],
              });
      group.records.push(item.record);
      groups.set(key, group);
    }
    const batches: BatchResult[] = [];
    const errors: GrowthOSError[] = [];
    for (const group of groups.values()) {
      for (const records of chunk(group.records, MAX_BATCH_SIZE)) {
        try {
          const result = toBatchResult(
            await request<RawBatch>(
              this.http,
              'POST',
              group.path,
              group.body(records),
              this.extraHeaders,
            ),
          );
          batches.push(result);
          this.onResult?.(result);
        } catch (error) {
          const failure =
            error instanceof GrowthOSError ? error : new GrowthOSError(String(error), 0, false);
          if (throwOnError) throw failure;
          errors.push(failure);
          this.onError(failure);
        }
      }
    }
    return sumResults(batches, errors);
  }

  private async validate(
    path: 'events' | 'entities' | 'measures',
    body: unknown,
  ): Promise<ValidationResult> {
    const raw = await request<{
      kind: ValidationResult['kind'];
      total: number;
      valid: number;
      invalid: number;
      records: { client_id: string; status: string; reasons?: string[] }[];
    }>(this.http, 'POST', `/v1/ingest/${path}/validate`, body);
    return {
      kind: raw.kind,
      total: raw.total,
      valid: raw.valid,
      invalid: raw.invalid,
      records: raw.records.map((record) => ({
        clientId: record.client_id,
        valid: record.status === 'valid',
        reasons: record.reasons ?? [],
      })),
    };
  }
}

/** Fields shorthand re-exported for callers building attribute objects. */
export type { Fields };
