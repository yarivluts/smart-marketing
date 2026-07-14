import type {
  AutomationGuardrailPolicy,
  GuardrailEvaluationContext,
  GuardrailViolation,
  ProposedBudgetChange,
  ProposedCampaignActivation,
  ProposedCampaignCreation,
} from './types';

function checkProtectedTarget(policy: AutomationGuardrailPolicy, targetId: string): GuardrailViolation | null {
  if (!policy.protectedTargetIds.includes(targetId)) {
    return null;
  }
  return {
    type: 'protected_target',
    message: `Target "${targetId}" is protected and cannot be modified by automation.`,
  };
}

function checkAllowedHours(policy: AutomationGuardrailPolicy, context: GuardrailEvaluationContext): GuardrailViolation | null {
  if (policy.allowedHours === null) {
    return null;
  }
  const hour = context.nowUtc.getUTCHours();
  const { startHourUtc, endHourUtc } = policy.allowedHours;
  const withinWindow = startHourUtc <= endHourUtc ? hour >= startHourUtc && hour < endHourUtc : hour >= startHourUtc || hour < endHourUtc;
  if (withinWindow) {
    return null;
  }
  return {
    type: 'outside_allowed_hours',
    message: `Automation is only allowed between ${startHourUtc}:00 and ${endHourUtc}:00 UTC.`,
  };
}

function checkBlastRadius(policy: AutomationGuardrailPolicy, context: GuardrailEvaluationContext): GuardrailViolation | null {
  if (policy.maxActionsPerDay === null || context.actionsExecutedToday < policy.maxActionsPerDay) {
    return null;
  }
  return {
    type: 'blast_radius',
    message: `Project has reached its daily automation action limit of ${policy.maxActionsPerDay}.`,
  };
}

function checkSpendCeiling(policy: AutomationGuardrailPolicy, dailyBudgetUsd: number): GuardrailViolation | null {
  if (policy.spendCeilingUsd === null || dailyBudgetUsd <= policy.spendCeilingUsd) {
    return null;
  }
  return {
    type: 'spend_ceiling',
    message: `Requested daily budget of $${dailyBudgetUsd} exceeds the $${policy.spendCeilingUsd} ceiling.`,
  };
}

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

  const protectedViolation = checkProtectedTarget(policy, change.targetId);
  if (protectedViolation) {
    violations.push(protectedViolation);
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

  const spendCeilingViolation = checkSpendCeiling(policy, change.afterDailyBudgetUsd);
  if (spendCeilingViolation) {
    violations.push(spendCeilingViolation);
  }

  const allowedHoursViolation = checkAllowedHours(policy, context);
  if (allowedHoursViolation) {
    violations.push(allowedHoursViolation);
  }

  const blastRadiusViolation = checkBlastRadius(policy, context);
  if (blastRadiusViolation) {
    violations.push(blastRadiusViolation);
  }

  return violations;
}

/**
 * Pure guardrail check for a proposed campaign-draft-creation action
 * (KAN-72) — reuses the same protected-target/spend-ceiling/allowed-hours/
 * blast-radius checks {@link evaluateBudgetChangeGuardrails} uses, but skips
 * `maxDailyBudgetChangePct` entirely: there is no "before" budget for a
 * brand-new campaign, so a percentage-change guardrail doesn't apply (a
 * `beforeDailyBudgetUsd: 0` reading would make it fire unconditionally for
 * any nonzero budget, which isn't what a "max % change per day" policy is
 * meant to police).
 */
export function evaluateCampaignCreationGuardrails(
  policy: AutomationGuardrailPolicy,
  change: ProposedCampaignCreation,
  context: GuardrailEvaluationContext,
): GuardrailViolation[] {
  return [
    checkProtectedTarget(policy, change.targetId),
    checkSpendCeiling(policy, change.dailyBudgetUsd),
    checkAllowedHours(policy, context),
    checkBlastRadius(policy, context),
  ].filter((violation): violation is GuardrailViolation => violation !== null);
}

/**
 * Pure guardrail check for a proposed campaign-activation action (KAN-72,
 * paused -> enabled) — no budget number is involved, so only the
 * protected-target/allowed-hours/blast-radius checks apply.
 */
export function evaluateCampaignActivationGuardrails(
  policy: AutomationGuardrailPolicy,
  change: ProposedCampaignActivation,
  context: GuardrailEvaluationContext,
): GuardrailViolation[] {
  return [checkProtectedTarget(policy, change.targetId), checkAllowedHours(policy, context), checkBlastRadius(policy, context)].filter(
    (violation): violation is GuardrailViolation => violation !== null,
  );
}
