import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * `running`: the executor is (or was, if the process died mid-flight) still working.
 * `succeeded`: the executor finished and `freshness` was written back.
 * `failed`: the executor threw — `error_message` carries why.
 */
export const ORCHESTRATION_RUN_STATUSES = ['running', 'succeeded', 'failed'] as const;
export type OrchestrationRunStatus = (typeof ORCHESTRATION_RUN_STATUSES)[number];

/**
 * How a run was started. `manual` is the only value today (KAN-38's
 * buildable-today "run once" stand-in — see `orchestration/executor.ts`'s
 * own doc comment for why a real scheduler is deferred to KAN-18); `manual`
 * is kept as an explicit enum value (not just an implicit default) so a
 * future `scheduled` trigger kind is a pure additive change to this list,
 * not a shape change.
 */
export const ORCHESTRATION_RUN_TRIGGERS = ['manual'] as const;
export type OrchestrationRunTrigger = (typeof ORCHESTRATION_RUN_TRIGGERS)[number];

/** The dbt core tables (KAN-37) a run's freshness snapshot reports on. */
export const ORCHESTRATION_FRESHNESS_TABLES = ['entities', 'events', 'measures'] as const;
export type OrchestrationFreshnessTable = (typeof ORCHESTRATION_FRESHNESS_TABLES)[number];

/**
 * One table's freshness snapshot as persisted on a run record — row count
 * plus the latest record timestamp for this project, as read back from the
 * dbt-built DuckDB tables at the moment this run's executor finished.
 * `latest_record_at` is `null` when the project has no rows in that table
 * yet (a legitimate outcome, not a missing-data error).
 */
export interface OrchestrationFreshnessRecord {
  table: OrchestrationFreshnessTable;
  row_count: number;
  latest_record_at: string | null;
}

/**
 * One orchestration run for a project (KAN-38: plan `13 §E4.2` "scheduled
 * runs per project, freshness metadata written back"). Firestore stands in
 * for a real Dagster/Cloud Workflows run-history store until KAN-18
 * provisions infra to run a real scheduler on — see
 * `orchestration/executor.ts`'s own doc comment for the executor seam this
 * record's `freshness`/`error_message` are populated from.
 *
 * Scoped to a project (not per-environment): the underlying dbt build KAN-37
 * already runs across every environment in one pass, and every other
 * project-level admin rollup in this codebase (`IngestBatchModel`,
 * `QuarantinedRecordModel`) folds environments into one view rather than
 * splitting by one, so this follows the same convention.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/orchestration_runs',
  path_id: 'orchestration_run_id',
})
export class OrchestrationRunModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public status!: OrchestrationRunStatus;

  @Field({ is_required: true })
  public trigger!: OrchestrationRunTrigger;

  /** The human who triggered this run, when there was one — absent for a future scheduled/system-triggered run. */
  @Field({ is_required: false })
  public triggered_by_user_id?: string;

  @Field({ is_required: true })
  public started_at!: string;

  /** Absent while `status === 'running'`. */
  @Field({ is_required: false })
  public finished_at?: string;

  /** Present only when `status === 'succeeded'`. */
  @Field({ is_required: false })
  public freshness?: OrchestrationFreshnessRecord[];

  /** Present only when `status === 'failed'`. */
  @Field({ is_required: false })
  public error_message?: string;
}
