import { SCHEMA_DEF_KINDS, type IngestBatchModel, type IngestRecordResult, type SchemaDefKind } from '@growthos/firebase-orm-models';

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
  recordResults: IngestRecordResult[];
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
    recordResults: batch.record_results,
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
  /** `(quarantined + duplicate) / total`, as a 0-100 percentage. */
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

export interface QuarantinedRecordView {
  batchId: string;
  kind: SchemaDefKind;
  environmentId: string;
  clientId: string;
  reasons: string[];
  createdAt: string;
}

export interface IngestHealthSummary {
  overall: IngestHealthRollup;
  byKind: IngestHealthRollup[];
  quarantinedRecords: QuarantinedRecordView[];
  /** True if more quarantined records exist among the considered batches than `quarantinedRecords` shows. */
  quarantinedRecordsTruncated: boolean;
  batchesConsidered: number;
}

const MIN_THROUGHPUT_WINDOW_MINUTES = 1;
export const DEFAULT_QUARANTINE_BROWSER_LIMIT = 100;

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

  const errorRatePercent = totalRecords === 0 ? 0 : ((quarantinedCount + duplicateCount) / totalRecords) * 100;
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
 * Throughput/error-rate/freshness rollup + a quarantine browser (KAN-35),
 * computed over the batches a caller already fetched (see
 * `listRecentIngestBatchesForProject`'s own documented cap) rather than any
 * new aggregation infra — there isn't any yet. A pure function of its inputs
 * (including `nowMs`, passed in rather than read from `Date.now()`) so it's
 * testable with fixed fixtures.
 */
export function computeIngestHealthSummary(
  batches: readonly IngestBatchView[],
  nowMs: number,
  quarantineLimit: number = DEFAULT_QUARANTINE_BROWSER_LIMIT,
): IngestHealthSummary {
  const byKindBatches = new Map<SchemaDefKind, IngestBatchView[]>();
  for (const batch of batches) {
    const list = byKindBatches.get(batch.kind) ?? [];
    list.push(batch);
    byKindBatches.set(batch.kind, list);
  }

  const byKind = SCHEMA_DEF_KINDS.filter((kind) => byKindBatches.has(kind)).map((kind) =>
    rollupKind(kind, byKindBatches.get(kind) ?? [], nowMs),
  );

  // Batches already arrive newest-first (the query's own `orderBy`), so
  // flattening preserves that order without re-sorting here.
  const allQuarantined: QuarantinedRecordView[] = [];
  for (const batch of batches) {
    for (const record of batch.recordResults) {
      if (record.status !== 'quarantined') continue;
      allQuarantined.push({
        batchId: batch.id,
        kind: batch.kind,
        environmentId: batch.environmentId,
        clientId: record.client_id,
        reasons: record.reasons ?? [],
        createdAt: batch.createdAt,
      });
    }
  }

  return {
    overall: rollupKind('overall', batches, nowMs),
    byKind,
    quarantinedRecords: allQuarantined.slice(0, quarantineLimit),
    quarantinedRecordsTruncated: allQuarantined.length > quarantineLimit,
    batchesConsidered: batches.length,
  };
}
