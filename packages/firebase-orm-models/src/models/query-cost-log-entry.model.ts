import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * `executed`: the compiled query cleared the daily quota and was handed to a
 * {@link WarehouseQueryExecutor} that ran it (successfully or not — a
 * downstream warehouse-side failure is still a real attempt against the
 * quota; this outcome only means "cleared the guardrail check").
 * `blocked_quota_exceeded`: rejected before the executor ever ran because the
 * project's daily quota was already spent.
 * `warehouse_not_configured`: cleared the guardrail check but there is no
 * real warehouse to run it against yet (KAN-18) — kept distinct from
 * `executed` so the cost log honestly reflects that this attempt never
 * touched a real warehouse, even though it did count against the quota (a
 * real deployment's version of this same attempt would have).
 */
export const QUERY_COST_LOG_OUTCOMES = ['executed', 'blocked_quota_exceeded', 'warehouse_not_configured'] as const;
export type QueryCostLogOutcome = (typeof QUERY_COST_LOG_OUTCOMES)[number];

/**
 * One `queryMetrics` call's cost-guardrail log entry (KAN-39, plan `13
 * §E4.3`: "query cost logging"). Append-only, one entry per non-cache-hit
 * call — a cache hit incurs no real (or would-be) warehouse cost, so it's
 * never logged here, mirroring why it also never touches the daily quota
 * count.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/query_cost_log_entries',
  path_id: 'query_cost_log_entry_id',
})
export class QueryCostLogEntryModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public outcome!: QueryCostLogOutcome;

  /** `metric:<name>@v<version>` per metric the query depended on — the same shape `queryMetrics` already returns as `definitionRefs`. */
  @Field({ is_required: true })
  public definition_refs!: Record<string, string>;

  @Field({ is_required: true })
  public executed_at!: string;

  /**
   * A best-effort dollar-cost estimate for this execution, from the real
   * `BigQueryWarehouseQueryExecutor`'s own reported bytes-processed x
   * BigQuery's on-demand list price (KAN-18's warehouse is now live — see
   * `bigquery-query-executor.ts`'s `executeWithStats`). Stays `null` for any
   * entry logged before an executor could report stats, for every non-`executed`
   * outcome (nothing ran against a real warehouse to have a cost), and in any
   * test/dev environment still running a stats-less fake executor — never a
   * fabricated number, the same honesty-over-fabrication posture
   * `WarehouseNotConfiguredError` already established for "no real warehouse
   * to bill against yet".
   */
  @Field({ is_required: false })
  public estimated_cost_usd?: number | null;
}
