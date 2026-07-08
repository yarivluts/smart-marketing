import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * One project's BigQuery cost-guardrail configuration, as of when it was set
 * (KAN-39, plan `13 §E4.3`: "per-project BQ quotas/labels"). Append-only
 * history rather than a single mutable settings doc — the same "current =
 * newest" convention `OrchestrationRunModel` (KAN-38) already established
 * for a project's freshness snapshot — so a project's guardrail history
 * stays inspectable (who tightened/loosened a quota, and when) without a
 * separate audit-log lookup; `getProjectCostQuota` derives the effective
 * config as the newest record, defaulting to `DEFAULT_DAILY_QUERY_LIMIT` when
 * none has ever been set.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/cost_quota_configs',
  path_id: 'cost_quota_config_id',
})
export class ProjectCostQuotaModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  /** Max real (non-cache-hit) metric-query attempts this project may make per UTC calendar day before `queryMetrics` starts rejecting new ones. */
  @Field({ is_required: true })
  public daily_query_limit!: number;

  /**
   * Free-form key/value labels that would tag a real BigQuery job for cost
   * attribution/billing export (the plan's own "quotas/labels" pairing) —
   * purely descriptive metadata today, recorded here for whenever KAN-18
   * provisions a real BigQuery project for these to actually apply to.
   */
  @Field({ is_required: true })
  public labels!: Record<string, string>;

  @Field({ is_required: true })
  public set_at!: string;

  /** The human who set this config, if any — absent for a future non-human/default-seeding caller. */
  @Field({ is_required: false })
  public set_by_user_id?: string;
}
