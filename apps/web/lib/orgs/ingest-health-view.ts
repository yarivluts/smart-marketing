import {
  SCHEMA_DEF_KINDS,
  type IngestBatchModel,
  type QuarantinedRecordModel,
  type SchemaDefKind,
} from '@growthos/firebase-orm-models';

/**
 * A plain, serializable projection of one `IngestBatchModel` (KAN-35). Client
 * components can only ever receive plain data across the RSC boundary, never
 * an `@arbel/firebase-orm` model instance — same reasoning as
 * `toSchemaDefView` in `schema-def-view.ts`.
 */
export interface IngestBatchView {
  id: string;
  kind: SchemaDefKind;
  environmentId: string;
  totalCount: number;
  acceptedCount: number;
  quarantinedCount: number;
  duplicateCount: number;
  createdAt: string;
}

export function toIngestBatchView(batch: IngestBatchModel): IngestBatchView {
  return {
    id: batch.id,
    kind: batch.kind,
    environmentId: batch.environment_id,
    totalCount: batch.total_count,
    acceptedCount: batch.accepted_count,
    quarantinedCount: batch.quarantined_count,
    duplicateCount: batch.duplicate_count,
    createdAt: batch.created_at,
  };
}

/** One rollup bucket — either "every kind combined" or one specific kind. */
export interface IngestHealthRollup {
  kind: SchemaDefKind | 'overall';
  batchCount: number;
  totalRecords: number;
  acceptedCount: number;
  quarantinedCount: number;
  duplicateCount: number;
  /**
   * `quarantined / total`, as a 0-100 percentage — validation failures only.
   * Deliberately excludes `duplicateCount`: a duplicate is a benign,
   * expected idempotent-retry outcome (see `IngestRecordResult`'s own doc
   * comment), not a data-quality problem, so folding it into "error rate"
   * would make a harmless client retry storm read as an ingestion outage.
   */
  errorRatePercent: number;
  latestBatchAt: string | null;
  /** Minutes since `latestBatchAt`, or `null` if this bucket has no batches at all. */
  freshnessMinutes: number | null;
  /**
   * Records per minute, averaged over the span from the oldest to the newest
   * batch considered (see `DEFAULT_INGEST_HEALTH_BATCH_LIMIT` — this is a
   * rollup over the most recent batches fetched, not the project's entire
   * history). Floored at `MIN_THROUGHPUT_WINDOW_MINUTES` so a burst of
   * batches within the same minute doesn't produce an inflated instantaneous
   * rate.
   */
  throughputPerMinute: number;
}

export interface IngestHealthSummary {
  overall: IngestHealthRollup;
  byKind: IngestHealthRollup[];
  batchesConsidered: number;
}

const MIN_THROUGHPUT_WINDOW_MINUTES = 1;

function rollupKind(kind: SchemaDefKind | 'overall', batches: readonly IngestBatchView[], nowMs: number): IngestHealthRollup {
  if (batches.length === 0) {
    return {
      kind,
      batchCount: 0,
      totalRecords: 0,
      acceptedCount: 0,
      quarantinedCount: 0,
      duplicateCount: 0,
      errorRatePercent: 0,
      latestBatchAt: null,
      freshnessMinutes: null,
      throughputPerMinute: 0,
    };
  }

  let totalRecords = 0;
  let acceptedCount = 0;
  let quarantinedCount = 0;
  let duplicateCount = 0;
  let latestMs = -Infinity;
  let earliestMs = Infinity;
  for (const batch of batches) {
    totalRecords += batch.totalCount;
    acceptedCount += batch.acceptedCount;
    quarantinedCount += batch.quarantinedCount;
    duplicateCount += batch.duplicateCount;
    const createdMs = Date.parse(batch.createdAt);
    latestMs = Math.max(latestMs, createdMs);
    earliestMs = Math.min(earliestMs, createdMs);
  }

  const errorRatePercent = totalRecords === 0 ? 0 : (quarantinedCount / totalRecords) * 100;
  const windowMinutes = Math.max((nowMs - earliestMs) / 60_000, MIN_THROUGHPUT_WINDOW_MINUTES);
  const throughputPerMinute = totalRecords / windowMinutes;
  const freshnessMinutes = Math.max(0, (nowMs - latestMs) / 60_000);

  return {
    kind,
    batchCount: batches.length,
    totalRecords,
    acceptedCount,
    quarantinedCount,
    duplicateCount,
    errorRatePercent,
    latestBatchAt: new Date(latestMs).toISOString(),
    freshnessMinutes,
    throughputPerMinute,
  };
}

/**
 * Throughput/error-rate/freshness rollup (KAN-35), computed over the batches
 * a caller already fetched (see `listRecentIngestBatchesForProject`'s own
 * documented cap) rather than any new aggregation infra — there isn't any
 * yet. A pure function of its inputs (including `nowMs`, passed in rather
 * than read from `Date.now()`) so it's testable with fixed fixtures.
 *
 * The quarantine browser used to be derived from these same batches'
 * `record_results` — since KAN-34 gave quarantined records their own durable,
 * stably-identified store (`QuarantinedRecordModel`), that's now a separate
 * fetch/view (see {@link toQuarantinedRecordView}), not part of this rollup.
 */
export function computeIngestHealthSummary(batches: readonly IngestBatchView[], nowMs: number): IngestHealthSummary {
  const byKindBatches = new Map<SchemaDefKind, IngestBatchView[]>();
  for (const batch of batches) {
    const list = byKindBatches.get(batch.kind) ?? [];
    list.push(batch);
    byKindBatches.set(batch.kind, list);
  }

  const byKind = SCHEMA_DEF_KINDS.filter((kind) => byKindBatches.has(kind)).map((kind) =>
    rollupKind(kind, byKindBatches.get(kind) ?? [], nowMs),
  );

  return {
    overall: rollupKind('overall', batches, nowMs),
    byKind,
    batchesConsidered: batches.length,
  };
}

/**
 * A plain, serializable projection of one `QuarantinedRecordModel` (KAN-34) —
 * unlike the old batch-derived view, `id` is this record's own stable
 * document id, so a replay action has something durable to reference (two
 * quarantined records sharing the same `clientId` no longer need a
 * `(batchId, recordIndex)` composite key to stay distinguishable).
 */
export interface QuarantinedRecordView {
  id: string;
  batchId: string;
  kind: SchemaDefKind;
  environmentId: string;
  clientId: string;
  reasons: string[];
  createdAt: string;
}

export function toQuarantinedRecordView(record: QuarantinedRecordModel): QuarantinedRecordView {
  return {
    id: record.id,
    batchId: record.batch_id,
    kind: record.kind,
    environmentId: record.environment_id,
    clientId: record.client_id,
    reasons: record.reasons,
    createdAt: record.created_at,
  };
}

/** `"<1"` below a minute, otherwise the rounded whole-minute count — used for the "last batch N min ago" display. */
export function formatMinutesAgo(minutes: number): string {
  if (minutes < 1) return '<1';
  return Math.round(minutes).toString();
}

/**
 * One decimal place below 10/min, a rounded whole number at or above it.
 * Rounds first so a value like 9.96 (which would print "10.0" under a raw
 * `>= 10` check on the unrounded number) consistently takes the whole-number
 * branch instead of straddling the threshold.
 */
export function formatThroughput(perMinute: number): string {
  const rounded = Math.round(perMinute * 10) / 10;
  return rounded >= 10 ? Math.round(rounded).toString() : rounded.toFixed(1);
}
