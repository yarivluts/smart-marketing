import type {
  AutomationActionModel,
  AutomationActionStatus,
  AutomationGuardrailPolicyConfig,
  AutomationKillSwitchStatus,
  AutomationTargetStateModel,
  GuardrailViolationType,
} from '@growthos/firebase-orm-models';

/** A plain, serializable projection of a project's effective automation guardrail policy — client components can only ever receive plain data across the RSC boundary, same reasoning as `toProjectCostQuotaView`. */
export interface AutomationGuardrailPolicyView {
  maxDailyBudgetChangePct: number | null;
  spendCeilingUsd: number | null;
  protectedTargetIds: string[];
  allowedHoursStartHourUtc: number | null;
  allowedHoursEndHourUtc: number | null;
  maxActionsPerDay: number | null;
  maxGuardedMetricRegressionPct: number | null;
  setAt: string | null;
}

export function toAutomationGuardrailPolicyView(policy: AutomationGuardrailPolicyConfig): AutomationGuardrailPolicyView {
  return {
    maxDailyBudgetChangePct: policy.maxDailyBudgetChangePct,
    spendCeilingUsd: policy.spendCeilingUsd,
    protectedTargetIds: policy.protectedTargetIds,
    allowedHoursStartHourUtc: policy.allowedHours?.startHourUtc ?? null,
    allowedHoursEndHourUtc: policy.allowedHours?.endHourUtc ?? null,
    maxActionsPerDay: policy.maxActionsPerDay,
    maxGuardedMetricRegressionPct: policy.maxGuardedMetricRegressionPct,
    setAt: policy.setAt,
  };
}

export type { AutomationKillSwitchStatus };

export interface AutomationTargetView {
  id: string;
  targetType: string;
  label: string;
  dailyBudgetUsd: number;
  environmentId: string;
}

export function toAutomationTargetView(target: AutomationTargetStateModel): AutomationTargetView {
  return {
    id: target.id,
    targetType: target.target_type,
    label: target.label,
    dailyBudgetUsd: target.daily_budget_usd,
    environmentId: target.environment_id,
  };
}

export interface AutomationActionView {
  id: string;
  targetId: string;
  targetLabel: string;
  beforeDailyBudgetUsd: number;
  afterDailyBudgetUsd: number;
  status: AutomationActionStatus;
  guardrailViolations: { type: GuardrailViolationType; message: string }[];
  proposedAt: string;
  executedAt?: string;
  failureReason?: string;
  rollbackReason?: string;
}

export function toAutomationActionView(action: AutomationActionModel): AutomationActionView {
  return {
    id: action.id,
    targetId: action.target_id,
    targetLabel: action.target_label,
    beforeDailyBudgetUsd: (action.before as { dailyBudgetUsd: number }).dailyBudgetUsd,
    afterDailyBudgetUsd: (action.after as { dailyBudgetUsd: number }).dailyBudgetUsd,
    status: action.status,
    guardrailViolations: action.guardrail_violations,
    proposedAt: action.proposed_at,
    ...(action.executed_at !== undefined ? { executedAt: action.executed_at } : {}),
    ...(action.failure_reason !== undefined ? { failureReason: action.failure_reason } : {}),
    ...(action.rollback_reason !== undefined ? { rollbackReason: action.rollback_reason } : {}),
  };
}

/** The `Automation` translation key for one action's status badge. */
const STATUS_LABEL_KEYS: Record<AutomationActionStatus, string> = {
  proposed: 'statusProposed',
  blocked: 'statusBlocked',
  awaiting_approval: 'statusAwaitingApproval',
  rejected: 'statusRejected',
  approved: 'statusApproved',
  executed: 'statusExecuted',
  failed: 'statusFailed',
  verified: 'statusVerified',
  rolled_back: 'statusRolledBack',
};

export function actionStatusLabelKey(status: AutomationActionStatus): string {
  return STATUS_LABEL_KEYS[status];
}

/** The `Automation` translation key for one guardrail violation type. */
const VIOLATION_LABEL_KEYS: Record<GuardrailViolationType, string> = {
  max_daily_change_pct: 'violationMaxDailyChangePct',
  spend_ceiling: 'violationSpendCeiling',
  protected_target: 'violationProtectedTarget',
  outside_allowed_hours: 'violationOutsideAllowedHours',
  blast_radius: 'violationBlastRadius',
  automation_paused: 'violationAutomationPaused',
};

export function violationLabelKey(type: GuardrailViolationType): string {
  return VIOLATION_LABEL_KEYS[type];
}
