import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { GuardrailViolation } from '@growthos/shared';

/**
 * KAN-71's action lifecycle (plan `02 §3`/`06 §7`: "dry-run diff -> approval
 * -> execute -> verify -> rollback"):
 *
 * `proposed` is a transient value never actually persisted — `proposeAutomationBudgetChangeAction`
 * always resolves straight to `blocked` (a guardrail was violated at
 * proposal time) or `awaiting_approval` (clean) before the first save, kept
 * as an explicit enum value so a future action type that needs a real
 * "drafted but not yet guardrail-checked" state is a pure additive change.
 * `blocked`/`rejected`/`failed`/`verified`/`rolled_back` are terminal.
 */
export const AUTOMATION_ACTION_STATUSES = [
  'proposed',
  'blocked',
  'awaiting_approval',
  'rejected',
  'approved',
  'executed',
  'failed',
  'verified',
  'rolled_back',
] as const;
export type AutomationActionStatus = (typeof AUTOMATION_ACTION_STATUSES)[number];

/** `budget_change` is the only type this story implements (the AC's own "simulated budget change" example) — a future Manage-tier action (creative swap, pause/enable) is a pure additive value. */
export const AUTOMATION_ACTION_TYPES = ['budget_change'] as const;
export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[number];

export type AutomationRollbackReason = 'manual' | 'guardrail_regression';

@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/automation_actions',
  path_id: 'automation_action_id',
})
export class AutomationActionModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public environment_id!: string;

  @Field({ is_required: true })
  public action_type!: AutomationActionType;

  @Field({ is_required: true })
  public target_id!: string;

  @Field({ is_required: true })
  public target_label!: string;

  /** The dry-run diff (KAN-71's "dry-run diff" AC) — `{ dailyBudgetUsd: number }` for the one action type implemented today. */
  @Field({ is_required: true })
  public before!: Record<string, unknown>;

  @Field({ is_required: true })
  public after!: Record<string, unknown>;

  @Field({ is_required: true })
  public status!: AutomationActionStatus;

  /** Populated at proposal time; non-empty only when `status === 'blocked'`. */
  @Field({ is_required: true })
  public guardrail_violations!: GuardrailViolation[];

  @Field({ is_required: true })
  public requested_by_user_id!: string;

  @Field({ is_required: true })
  public proposed_at!: string;

  @Field({ is_required: false })
  public approved_by_user_id?: string;

  @Field({ is_required: false })
  public approved_at?: string;

  @Field({ is_required: false })
  public rejected_by_user_id?: string;

  @Field({ is_required: false })
  public rejected_at?: string;

  @Field({ is_required: false })
  public executed_at?: string;

  /** How many `executor.executeBudgetChange` attempts the retry/backoff loop made — present once execution has been attempted at all, regardless of outcome. */
  @Field({ is_required: false })
  public execute_attempts?: number;

  /** Present only when `status === 'failed'`. */
  @Field({ is_required: false })
  public failure_reason?: string;

  @Field({ is_required: false })
  public verified_at?: string;

  /** How far the supplied guarded metric moved (positive = worse) when `verifyAutomationAction` was called with observed values — absent when verify was called with no metric to check. */
  @Field({ is_required: false })
  public guarded_metric_regression_pct?: number;

  @Field({ is_required: false })
  public rolled_back_at?: string;

  @Field({ is_required: false })
  public rollback_reason?: AutomationRollbackReason;

  /** Absent for an automatic guardrail-regression rollback — there was no human actor. */
  @Field({ is_required: false })
  public rolled_back_by_user_id?: string;
}
