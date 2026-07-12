import { evaluateBudgetChangeGuardrails, type GuardrailViolation } from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import { AutomationTargetStateModel } from '../models/automation-target-state.model';
import { AutomationActionModel, type AutomationActionStatus } from '../models/automation-action.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';
import { getActiveAutomationGuardrailPolicy, toPureGuardrailPolicy } from './automation-guardrail.service';
import { isAutomationKillSwitchEngaged } from './automation-kill-switch.service';
import { runWithRetryBackoff } from '../plugin-runtime/retry';
import { defaultAutomationActionExecutor, type AutomationActionExecutor } from '../automation-runtime';
import { AutomationActionInvalidStateError, AutomationActionNotFoundError, AutomationKillSwitchEngagedError, AutomationTargetNotFoundError, InvalidAutomationActionError } from './automation-errors';

export { AutomationTargetNotFoundError, AutomationActionNotFoundError, AutomationActionInvalidStateError, AutomationKillSwitchEngagedError, InvalidAutomationActionError };

/** Bounds how many of today's executed actions this reads to enforce the blast-radius guardrail — same reasoning as `checkProjectQueryQuota`'s own bound. */
const DEFAULT_ACTION_LIST_LIMIT = 100;

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

async function loadAction(organizationId: string, projectId: string, actionId: string): Promise<AutomationActionModel> {
  const action = await AutomationActionModel.init(actionId, { organization_id: organizationId, project_id: projectId });
  if (!action || action.project_id !== projectId) {
    throw new AutomationActionNotFoundError();
  }
  return action;
}

async function requireStatus(action: AutomationActionModel, expected: AutomationActionStatus, attemptedTransition: string): Promise<void> {
  if (action.status !== expected) {
    throw new AutomationActionInvalidStateError(action.status, attemptedTransition);
  }
}

interface AuditParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  actorType: 'user' | 'system';
  actorId: string;
  action: string;
  targetId: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

async function auditBestEffort(params: AuditParams): Promise<void> {
  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: params.environmentId,
      actorType: params.actorType,
      actorId: params.actorId,
      action: params.action,
      targetType: 'automation_action',
      targetId: params.targetId,
      summary: params.summary,
      before: params.before,
      after: params.after,
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }
}

export interface SeedAutomationTargetParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  targetType: string;
  label: string;
  initialDailyBudgetUsd: number;
  seededByUserId: string;
}

/**
 * Idempotent get-or-create for a simulated ad-platform target's starting
 * state (same "register-if-missing" posture as `ensureTouchpointSchemaRegistered`,
 * KAN-57) — a real Google/Meta connector (KAN-72/73) would instead read the
 * target's actual live state on first sight of it.
 */
export async function ensureAutomationTargetSeeded(params: SeedAutomationTargetParams): Promise<AutomationTargetStateModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  if (!Number.isFinite(params.initialDailyBudgetUsd) || params.initialDailyBudgetUsd < 0) {
    throw new InvalidAutomationActionError('initialDailyBudgetUsd must be a non-negative number');
  }

  const existing = await AutomationTargetStateModel.init(params.targetId, { organization_id: params.organizationId, project_id: params.projectId });
  if (existing) {
    return existing;
  }

  const target = new AutomationTargetStateModel();
  target.organization_id = params.organizationId;
  target.project_id = params.projectId;
  target.environment_id = params.environmentId;
  target.target_type = params.targetType;
  target.label = params.label;
  target.daily_budget_usd = params.initialDailyBudgetUsd;
  const now = new Date().toISOString();
  target.seeded_at = now;
  target.updated_at = now;
  target.seeded_by_user_id = params.seededByUserId;
  target.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await target.save(params.targetId);
  return target;
}

/** Every simulated target seeded for a project, across all its environments — same cross-environment "one admin view" posture as `listApiKeysForProject`. */
export async function listAutomationTargetStatesForProject(organizationId: string, projectId: string): Promise<AutomationTargetStateModel[]> {
  return AutomationTargetStateModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .get();
}

/**
 * How many automation actions this project has already *executed* today
 * (UTC calendar day) — the blast-radius guardrail's own counter. Only
 * queried when the policy actually sets `maxActionsPerDay` (an off guardrail
 * shouldn't cost a read), bounded to `limit + 1` documents the same way
 * `checkProjectQueryQuota` bounds its own quota read.
 */
async function countAutomationActionsExecutedToday(organizationId: string, projectId: string, now: Date, limit: number): Promise<number> {
  const startOfDayIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const executedToday = await AutomationActionModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('executed_at', '>=', startOfDayIso)
    .limit(limit + 1)
    .get();
  return executedToday.length;
}

export interface ProposeAutomationBudgetChangeParams {
  organizationId: string;
  projectId: string;
  targetId: string;
  afterDailyBudgetUsd: number;
  requestedByUserId: string;
  now?: Date;
}

/**
 * KAN-71's dry-run-diff step: resolves the target's current (simulated) state
 * as the "before" half of the diff, evaluates every guardrail type against
 * the proposed change (including the org kill switch), and lands the action
 * as `blocked` (any violation) or `awaiting_approval` (clean) — never
 * `proposed`, see `AutomationActionModel`'s own doc comment.
 */
export async function proposeAutomationBudgetChangeAction(params: ProposeAutomationBudgetChangeParams): Promise<AutomationActionModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  if (!Number.isFinite(params.afterDailyBudgetUsd) || params.afterDailyBudgetUsd < 0) {
    throw new InvalidAutomationActionError('afterDailyBudgetUsd must be a non-negative number');
  }

  const target = await AutomationTargetStateModel.init(params.targetId, { organization_id: params.organizationId, project_id: params.projectId });
  if (!target) {
    throw new AutomationTargetNotFoundError(params.targetId);
  }

  const now = params.now ?? new Date();
  const policy = await getActiveAutomationGuardrailPolicy(params.organizationId, params.projectId);
  const actionsExecutedToday =
    policy.maxActionsPerDay !== null
      ? await countAutomationActionsExecutedToday(params.organizationId, params.projectId, now, policy.maxActionsPerDay)
      : 0;

  const violations: GuardrailViolation[] = evaluateBudgetChangeGuardrails(
    toPureGuardrailPolicy(policy),
    { targetId: params.targetId, beforeDailyBudgetUsd: target.daily_budget_usd, afterDailyBudgetUsd: params.afterDailyBudgetUsd },
    { nowUtc: now, actionsExecutedToday },
  );

  if (await isAutomationKillSwitchEngaged(params.organizationId)) {
    violations.push({ type: 'automation_paused', message: 'Automation is paused for this organization (kill switch engaged).' });
  }

  const before = { dailyBudgetUsd: target.daily_budget_usd };
  const after = { dailyBudgetUsd: params.afterDailyBudgetUsd };
  const status: AutomationActionStatus = violations.length > 0 ? 'blocked' : 'awaiting_approval';

  const action = new AutomationActionModel();
  action.organization_id = params.organizationId;
  action.project_id = params.projectId;
  action.environment_id = target.environment_id;
  action.action_type = 'budget_change';
  action.target_id = params.targetId;
  action.target_label = target.label;
  action.before = before;
  action.after = after;
  action.status = status;
  action.guardrail_violations = violations;
  action.requested_by_user_id = params.requestedByUserId;
  action.proposed_at = now.toISOString();
  action.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await action.save();

  await auditBestEffort({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: target.environment_id,
    actorType: 'user',
    actorId: params.requestedByUserId,
    action: 'automation_action.propose',
    targetId: action.id,
    summary:
      status === 'blocked'
        ? `Proposed a budget change for "${target.label}" — blocked by ${violations.length} guardrail(s)`
        : `Proposed a budget change for "${target.label}"`,
    before,
    after,
  });

  return action;
}

export interface ApproveAutomationActionParams {
  organizationId: string;
  projectId: string;
  actionId: string;
  approverId: string;
}

export async function approveAutomationAction(params: ApproveAutomationActionParams): Promise<AutomationActionModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const action = await loadAction(params.organizationId, params.projectId, params.actionId);
  await requireStatus(action, 'awaiting_approval', 'approve');

  if (await isAutomationKillSwitchEngaged(params.organizationId)) {
    throw new AutomationKillSwitchEngagedError();
  }

  action.status = 'approved';
  action.approved_by_user_id = params.approverId;
  action.approved_at = new Date().toISOString();
  await action.save();

  await auditBestEffort({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: action.environment_id,
    actorType: 'user',
    actorId: params.approverId,
    action: 'automation_action.approve',
    targetId: action.id,
    summary: `Approved the budget change for "${action.target_label}"`,
  });

  return action;
}

export interface RejectAutomationActionParams {
  organizationId: string;
  projectId: string;
  actionId: string;
  rejectedByUserId: string;
}

export async function rejectAutomationAction(params: RejectAutomationActionParams): Promise<AutomationActionModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const action = await loadAction(params.organizationId, params.projectId, params.actionId);
  if (action.status !== 'awaiting_approval' && action.status !== 'blocked') {
    throw new AutomationActionInvalidStateError(action.status, 'reject');
  }

  action.status = 'rejected';
  action.rejected_by_user_id = params.rejectedByUserId;
  action.rejected_at = new Date().toISOString();
  await action.save();

  await auditBestEffort({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: action.environment_id,
    actorType: 'user',
    actorId: params.rejectedByUserId,
    action: 'automation_action.reject',
    targetId: action.id,
    summary: `Rejected the budget change for "${action.target_label}"`,
  });

  return action;
}

export interface ExecuteAutomationActionParams {
  organizationId: string;
  projectId: string;
  actionId: string;
  executedByUserId: string;
  executor?: AutomationActionExecutor;
}

/** Retry/backoff config for a single executor call — same shape KAN-47's source-plugin runs already use. */
const EXECUTE_RETRY_OPTIONS = { maxAttempts: 3, baseDelayMs: 200 };

export async function executeAutomationAction(params: ExecuteAutomationActionParams): Promise<AutomationActionModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const action = await loadAction(params.organizationId, params.projectId, params.actionId);
  await requireStatus(action, 'approved', 'execute');

  if (await isAutomationKillSwitchEngaged(params.organizationId)) {
    throw new AutomationKillSwitchEngagedError();
  }

  const executor = params.executor ?? defaultAutomationActionExecutor;
  const before = action.before as { dailyBudgetUsd: number };
  const after = action.after as { dailyBudgetUsd: number };

  try {
    const { attempts } = await runWithRetryBackoff(
      () =>
        executor.executeBudgetChange({
          organizationId: params.organizationId,
          projectId: params.projectId,
          environmentId: action.environment_id,
          targetId: action.target_id,
          beforeDailyBudgetUsd: before.dailyBudgetUsd,
          afterDailyBudgetUsd: after.dailyBudgetUsd,
        }),
      EXECUTE_RETRY_OPTIONS,
    );
    action.status = 'executed';
    action.executed_at = new Date().toISOString();
    action.execute_attempts = attempts;
    await action.save();

    await auditBestEffort({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: action.environment_id,
      actorType: 'user',
      actorId: params.executedByUserId,
      action: 'automation_action.execute',
      targetId: action.id,
      summary: `Executed the budget change for "${action.target_label}"`,
      before,
      after,
    });
  } catch (error) {
    action.status = 'failed';
    action.execute_attempts = EXECUTE_RETRY_OPTIONS.maxAttempts;
    action.failure_reason = error instanceof Error ? error.message : String(error);
    await action.save();

    await auditBestEffort({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: action.environment_id,
      actorType: 'user',
      actorId: params.executedByUserId,
      action: 'automation_action.execute_failed',
      targetId: action.id,
      summary: `Failed to execute the budget change for "${action.target_label}": ${action.failure_reason}`,
    });
  }

  return action;
}

export interface RollbackAutomationActionParams {
  organizationId: string;
  projectId: string;
  actionId: string;
  reason: 'manual' | 'guardrail_regression';
  actorId?: string;
  executor?: AutomationActionExecutor;
}

/**
 * Restores a target to its pre-action state (KAN-71's "rollback restores
 * prior state" AC) — callable directly (a human undoing an executed/verified
 * action) or from {@link verifyAutomationAction} when a guarded metric
 * regressed past the policy's threshold.
 */
export async function rollbackAutomationAction(params: RollbackAutomationActionParams): Promise<AutomationActionModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const action = await loadAction(params.organizationId, params.projectId, params.actionId);
  if (action.status !== 'executed' && action.status !== 'verified') {
    throw new AutomationActionInvalidStateError(action.status, 'roll back');
  }

  const executor = params.executor ?? defaultAutomationActionExecutor;
  const before = action.before as { dailyBudgetUsd: number };
  const after = action.after as { dailyBudgetUsd: number };

  await executor.rollbackBudgetChange({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: action.environment_id,
    targetId: action.target_id,
    beforeDailyBudgetUsd: before.dailyBudgetUsd,
    afterDailyBudgetUsd: after.dailyBudgetUsd,
  });

  action.status = 'rolled_back';
  action.rolled_back_at = new Date().toISOString();
  action.rollback_reason = params.reason;
  if (params.actorId !== undefined) {
    action.rolled_back_by_user_id = params.actorId;
  }
  await action.save();

  await auditBestEffort({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: action.environment_id,
    actorType: params.actorId !== undefined ? 'user' : 'system',
    actorId: params.actorId ?? 'automation-verify-worker',
    action: 'automation_action.rollback',
    targetId: action.id,
    summary: `Rolled back the budget change for "${action.target_label}" (${params.reason})`,
    before: after,
    after: before,
  });

  return action;
}

export interface VerifyAutomationActionParams {
  organizationId: string;
  projectId: string;
  actionId: string;
  verifiedByUserId: string;
  /**
   * The guarded business metric's observed before/after values, if the
   * caller has them (a real KAN-72/73 connector, or a human pasting numbers
   * from the ad platform's own dashboard today). Omit to just record
   * "looks fine" with no auto-rollback check. Direction convention: higher
   * is assumed better, so a *drop* from before to after is a regression.
   */
  guardedMetricBefore?: number;
  guardedMetricAfter?: number;
  executor?: AutomationActionExecutor;
}

/**
 * KAN-71's verify step — if a guarded metric's observed before/after values
 * are supplied and the metric worsened past the policy's
 * `maxGuardedMetricRegressionPct` threshold, auto-rolls back and marks the
 * action `rolled_back` (plan `06 §7`: "if a guarded metric worsens past
 * threshold after an action, revert and alert"); otherwise marks it
 * `verified`.
 */
export async function verifyAutomationAction(params: VerifyAutomationActionParams): Promise<AutomationActionModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const action = await loadAction(params.organizationId, params.projectId, params.actionId);
  await requireStatus(action, 'executed', 'verify');

  const hasGuardedMetric = params.guardedMetricBefore !== undefined && params.guardedMetricAfter !== undefined;
  let regressionPct: number | undefined;
  if (hasGuardedMetric) {
    const guardedBefore = params.guardedMetricBefore as number;
    const guardedAfter = params.guardedMetricAfter as number;
    regressionPct = guardedBefore === 0 ? 0 : ((guardedBefore - guardedAfter) / guardedBefore) * 100;
  }

  const policy = await getActiveAutomationGuardrailPolicy(params.organizationId, params.projectId);
  const breached =
    hasGuardedMetric && policy.maxGuardedMetricRegressionPct !== null && (regressionPct as number) > policy.maxGuardedMetricRegressionPct;

  if (breached) {
    action.verified_at = new Date().toISOString();
    action.guarded_metric_regression_pct = regressionPct;
    await action.save();
    return rollbackAutomationAction({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actionId: params.actionId,
      reason: 'guardrail_regression',
    });
  }

  action.status = 'verified';
  action.verified_at = new Date().toISOString();
  if (regressionPct !== undefined) {
    action.guarded_metric_regression_pct = regressionPct;
  }
  await action.save();

  await auditBestEffort({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: action.environment_id,
    actorType: 'user',
    actorId: params.verifiedByUserId,
    action: 'automation_action.verify',
    targetId: action.id,
    summary: `Verified the budget change for "${action.target_label}"`,
  });

  return action;
}

/** A project's automation action queue/history, newest-proposal-first. */
export async function listAutomationActionsForProject(
  organizationId: string,
  projectId: string,
  limit: number = DEFAULT_ACTION_LIST_LIMIT,
): Promise<AutomationActionModel[]> {
  return AutomationActionModel.initPath({ organization_id: organizationId, project_id: projectId })
    .query()
    .orderBy('proposed_at', 'desc')
    .limit(limit)
    .get();
}
