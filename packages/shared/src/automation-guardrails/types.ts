/**
 * The tenant-configurable guardrail policy a Manage-tier automation action is
 * checked against before it's even offered for approval (KAN-71, plan
 * `06 §7`: "max % budget change/day, absolute spend ceilings, protected/
 * frozen campaigns, allowed hours, per-action blast-radius limits"). A `null`
 * field means that guardrail type is switched off for the project.
 */
export interface AutomationGuardrailPolicy {
  /** Max absolute percentage change (either direction) allowed in one day for a single target's budget. */
  maxDailyBudgetChangePct: number | null;
  /** Max daily budget (USD) any single action may set a target to. */
  spendCeilingUsd: number | null;
  /** Target ids automation may never modify, regardless of any other guardrail. */
  protectedTargetIds: readonly string[];
  /** UTC hour-of-day window automation may execute in. `startHourUtc > endHourUtc` means the window wraps past midnight. */
  allowedHours: { startHourUtc: number; endHourUtc: number } | null;
  /** Max automation actions this project may execute per UTC calendar day. */
  maxActionsPerDay: number | null;
}

/** A proposed budget-change action, in the shape the guardrail engine needs to evaluate it. */
export interface ProposedBudgetChange {
  targetId: string;
  beforeDailyBudgetUsd: number;
  afterDailyBudgetUsd: number;
}

export interface GuardrailEvaluationContext {
  nowUtc: Date;
  /** How many automation actions this project has already executed today (UTC calendar day) — the blast-radius counter. */
  actionsExecutedToday: number;
}

export const GUARDRAIL_VIOLATION_TYPES = [
  'max_daily_change_pct',
  'spend_ceiling',
  'protected_target',
  'outside_allowed_hours',
  'blast_radius',
  /** Not produced by {@link evaluateBudgetChangeGuardrails} itself (it's a pure function with no org-level kill-switch state) — reserved for `packages/firebase-orm-models`' `automation.service.ts` to append when the org's kill switch is engaged, so a blocked action's violation list always explains every reason it's blocked in one place. */
  'automation_paused',
] as const;
export type GuardrailViolationType = (typeof GUARDRAIL_VIOLATION_TYPES)[number];

export interface GuardrailViolation {
  type: GuardrailViolationType;
  message: string;
}
