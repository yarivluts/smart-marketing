/** One request-side input to a cohort-retention query — which conversion event to break the matrix down by, and which cohort months (inclusive, `YYYY-MM`) to include. */
export interface CohortRetentionQuery {
  organizationId: string;
  projectId: string;
  conversionEvent: string;
  /** Inclusive, `YYYY-MM`. */
  cohortMonthStart: string;
  /** Inclusive, `YYYY-MM`. */
  cohortMonthEnd: string;
}

/** One heatmap cell — mirrors `cohort_retention.sql`'s own output columns 1:1 (KAN-62). */
export interface CohortRetentionRow {
  /** `YYYY-MM-DD` (always the first of the month). */
  cohortMonth: string;
  periodIndex: number;
  cohortSize: number;
  convertedCustomers: number;
  retentionRate: number;
}

/**
 * Runs a cohort-retention query against KAN-62's `cohort_retention` dbt core
 * table and returns its matching rows. Provider-agnostic for the same
 * reason {@link WarehouseQueryExecutor} (`query-executor.ts`) is — a real
 * BigQuery-backed implementation slots in later without callers changing —
 * but kept as its own separate interface rather than reusing
 * `WarehouseQueryExecutor` itself: that one is typed around `CompiledMetricQuery`
 * (KAN-41's semantic-layer compiler output), which a cohort query isn't --
 * cohort tiles don't reference the KAN-40 metric catalog at all (see
 * `BoardTile.cohortConversionEvent`'s own doc comment).
 */
export interface CohortRetentionQueryExecutor {
  execute(query: CohortRetentionQuery): Promise<CohortRetentionRow[]>;
}

export class CohortWarehouseNotConfiguredError extends Error {
  constructor() {
    super('Cohort retention query execution is not configured yet — no BigQuery project exists until KAN-18 provisions one.');
    this.name = 'CohortWarehouseNotConfiguredError';
  }
}

/**
 * The default {@link CohortRetentionQueryExecutor} in every environment
 * today — same posture as {@link NotConfiguredWarehouseQueryExecutor}
 * (`query-executor.ts`'s own doc comment): real execution needs both
 * KAN-18 (a BigQuery project) and KAN-37/KAN-62 (this dbt project's own
 * `cohort_retention` core table) before it's buildable. Throws a typed,
 * catchable error rather than returning an empty result set, so a caller
 * can tell "not configured yet" apart from "this cohort legitimately has
 * no data".
 */
export class NotConfiguredCohortRetentionQueryExecutor implements CohortRetentionQueryExecutor {
  execute(): Promise<CohortRetentionRow[]> {
    return Promise.reject(new CohortWarehouseNotConfiguredError());
  }
}

export const defaultCohortRetentionQueryExecutor: CohortRetentionQueryExecutor = new NotConfiguredCohortRetentionQueryExecutor();
