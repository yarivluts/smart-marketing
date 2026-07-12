import type { AutomationGuardrailPolicy, GuardrailEvaluationContext, GuardrailViolation, ProposedBudgetChange } from './types';

/**
 * Pure guardrail check for a proposed Manage-tier budget-change action
 * (KAN-71, plan `06 §7`) — every guardrail type the AC lists, each producing
 * its own typed {@link GuardrailViolation} rather than a single boolean, so a
 * caller (and the admin UI) can show *which* rule blocked the action. No
 * Firestore/IO here — `packages/firebase-orm-models`'s `automation.service.ts`
 * resolves the policy + today's action count and calls this.
 */
export function evaluateBudgetChangeGuardrails(
  policy: AutomationGuardrailPolicy,
  change: ProposedBudgetChange,
  context: GuardrailEvaluationContext,
): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];

  if (policy.protectedTargetIds.includes(change.targetId)) {
    violations.push({
      type: 'protected_target',
      message: `Target "${change.targetId}" is protected and cannot be modified by automation.`,
    });
  }

  if (policy.maxDailyBudgetChangePct !== null) {
    const changePct =
      change.beforeDailyBudgetUsd === 0
        ? change.afterDailyBudgetUsd === 0
          ? 0
          : Infinity
        : (Math.abs(change.afterDailyBudgetUsd - change.beforeDailyBudgetUsd) / change.beforeDailyBudgetUsd) * 100;
    if (changePct > policy.maxDailyBudgetChangePct) {
      const changePctLabel = Number.isFinite(changePct) ? `${changePct.toFixed(1)}%` : 'an unbounded';
      violations.push({
        type: 'max_daily_change_pct',
        message: `Requested change of ${changePctLabel} exceeds the ${policy.maxDailyBudgetChangePct}% daily limit.`,
      });
    }
  }

  if (policy.spendCeilingUsd !== null && change.afterDailyBudgetUsd > policy.spendCeilingUsd) {
    violations.push({
      type: 'spend_ceiling',
      message: `Requested daily budget of $${change.afterDailyBudgetUsd} exceeds the $${policy.spendCeilingUsd} ceiling.`,
    });
  }

  if (policy.allowedHours !== null) {
    const hour = context.nowUtc.getUTCHours();
    const { startHourUtc, endHourUtc } = policy.allowedHours;
    const withinWindow =
      startHourUtc <= endHourUtc ? hour >= startHourUtc && hour < endHourUtc : hour >= startHourUtc || hour < endHourUtc;
    if (!withinWindow) {
      violations.push({
        type: 'outside_allowed_hours',
        message: `Automation is only allowed between ${startHourUtc}:00 and ${endHourUtc}:00 UTC.`,
      });
    }
  }

  if (policy.maxActionsPerDay !== null && context.actionsExecutedToday >= policy.maxActionsPerDay) {
    violations.push({
      type: 'blast_radius',
      message: `Project has reached its daily automation action limit of ${policy.maxActionsPerDay}.`,
    });
  }

  return violations;
}
