import type { OrchestrationFreshnessTable, OrchestrationRunModel, OrchestrationRunStatus, SchemaDefKind } from '@growthos/firebase-orm-models';

/**
 * A plain, serializable projection of one table's freshness snapshot on an
 * `OrchestrationRunModel` (KAN-38). Client components can only ever receive
 * plain data across the RSC boundary, never an `@arbel/firebase-orm` model
 * instance — same reasoning as `toIngestBatchView`.
 */
export interface OrchestrationFreshnessEntryView {
  table: OrchestrationFreshnessTable;
  rowCount: number;
  latestRecordAt: string | null;
}

export interface OrchestrationRunView {
  id: string;
  status: OrchestrationRunStatus;
  startedAt: string;
  finishedAt: string | null;
  /** Present only for a `succeeded` run. */
  freshness: OrchestrationFreshnessEntryView[] | null;
  /** Present only for a `failed` run. */
  errorMessage: string | null;
}

export function toOrchestrationRunView(run: OrchestrationRunModel): OrchestrationRunView {
  return {
    id: run.id,
    status: run.status,
    startedAt: run.started_at,
    finishedAt: run.finished_at ?? null,
    freshness: run.freshness
      ? run.freshness.map((entry) => ({ table: entry.table, rowCount: entry.row_count, latestRecordAt: entry.latest_record_at }))
      : null,
    errorMessage: run.error_message ?? null,
  };
}

/**
 * The most recent *succeeded* run's freshness snapshot among the runs
 * already fetched (`listOrchestrationRunsForProject`'s own newest-first
 * order), or `null` if none of them succeeded (never triggered, or every
 * attempt within the fetched history so far has failed). Deriving this from
 * the already-fetched run history — rather than a dedicated second Firestore
 * query — mirrors `computeIngestHealthSummary`'s own "compute a rollup
 * view-side from a list the page already fetched" posture.
 */
export function deriveCurrentFreshness(runs: readonly OrchestrationRunView[]): OrchestrationRunView | null {
  return runs.find((run) => run.status === 'succeeded') ?? null;
}

/**
 * The `IngestHealth` translation key for one freshness table's label — reuses
 * the same `entity`/`event`/`measure` keys the ingest-health summary rollup
 * above already translates to "Entities"/"Events"/"Measures", rather than
 * adding a second, near-duplicate set of plural-table-name keys.
 */
const FRESHNESS_TABLE_LABEL_KEYS: Record<OrchestrationFreshnessTable, SchemaDefKind> = {
  entities: 'entity',
  events: 'event',
  measures: 'measure',
};

export function freshnessTableLabelKey(table: OrchestrationFreshnessTable): SchemaDefKind {
  return FRESHNESS_TABLE_LABEL_KEYS[table];
}

/** The `IngestHealth` translation key for one run's status label. */
const RUN_STATUS_LABEL_KEYS: Record<OrchestrationRunStatus, 'orchestrationRunStatusRunning' | 'orchestrationRunStatusSucceeded' | 'orchestrationRunStatusFailed'> = {
  running: 'orchestrationRunStatusRunning',
  succeeded: 'orchestrationRunStatusSucceeded',
  failed: 'orchestrationRunStatusFailed',
};

export function runStatusLabelKey(
  status: OrchestrationRunStatus,
): 'orchestrationRunStatusRunning' | 'orchestrationRunStatusSucceeded' | 'orchestrationRunStatusFailed' {
  return RUN_STATUS_LABEL_KEYS[status];
}
