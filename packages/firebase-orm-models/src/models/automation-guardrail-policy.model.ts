import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * One project's KAN-71 automation guardrail policy, as of when it was set —
 * the same "current = newest" append-only convention `ProjectCostQuotaModel`
 * (KAN-39) already established, so a project's guardrail history stays
 * inspectable (who loosened/tightened a limit, and when) without a separate
 * audit-log lookup. `getActiveAutomationGuardrailPolicy` derives the
 * effective policy as the newest record, defaulting to
 * `DEFAULT_AUTOMATION_GUARDRAIL_POLICY` when none has ever been set.
 *
 * `null` on any of the four tunable fields means that guardrail type is
 * switched off for the project (see `@growthos/shared`'s
 * `AutomationGuardrailPolicy` for the pure evaluation shape this maps onto).
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/automation_guardrail_policies',
  path_id: 'automation_guardrail_policy_id',
})
export class AutomationGuardrailPolicyModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: false })
  public max_daily_budget_change_pct!: number | null;

  @Field({ is_required: false })
  public spend_ceiling_usd!: number | null;

  @Field({ is_required: true })
  public protected_target_ids!: string[];

  @Field({ is_required: false })
  public allowed_hours_start_hour_utc!: number | null;

  @Field({ is_required: false })
  public allowed_hours_end_hour_utc!: number | null;

  @Field({ is_required: false })
  public max_actions_per_day!: number | null;

  /** Regression threshold (percentage points) an action's guarded metric may worsen by before `verifyAutomationAction` auto-rolls it back. `null` disables auto-rollback-on-verify (the action can still be rolled back manually). */
  @Field({ is_required: false })
  public max_guarded_metric_regression_pct!: number | null;

  @Field({ is_required: true })
  public set_at!: string;

  /** The human who set this policy, if any — absent for a future non-human/default-seeding caller. */
  @Field({ is_required: false })
  public set_by_user_id?: string;
}
