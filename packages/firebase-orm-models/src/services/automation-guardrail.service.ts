import type { AutomationGuardrailPolicy as PureAutomationGuardrailPolicy } from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import { AutomationGuardrailPolicyModel } from '../models/automation-guardrail-policy.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';
import { InvalidAutomationActionError } from './automation-errors';

/**
 * Generous-but-real defaults (same reasoning as `DEFAULT_DAILY_QUERY_LIMIT`,
 * KAN-39): loose enough that no story's own demo traffic trips one by
 * accident, tight enough to be an actual guardrail rather than a number
 * nobody could ever reach.
 */
export const DEFAULT_AUTOMATION_GUARDRAIL_POLICY: Omit<AutomationGuardrailPolicyConfig, 'setAt' | 'setByUserId'> = {
  maxDailyBudgetChangePct: 25,
  spendCeilingUsd: null,
  protectedTargetIds: [],
  allowedHours: null,
  maxActionsPerDay: 20,
  maxGuardedMetricRegressionPct: 20,
};

export interface AutomationGuardrailPolicyConfig {
  maxDailyBudgetChangePct: number | null;
  spendCeilingUsd: number | null;
  protectedTargetIds: string[];
  allowedHours: { startHourUtc: number; endHourUtc: number } | null;
  maxActionsPerDay: number | null;
  maxGuardedMetricRegressionPct: number | null;
  /** `null` when the project has never had an explicit policy set — {@link DEFAULT_AUTOMATION_GUARDRAIL_POLICY} applies. */
  setAt: string | null;
  setByUserId?: string;
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

/** The effective guardrail policy for a project: its newest explicit config, or the documented default when none has ever been set. */
export async function getActiveAutomationGuardrailPolicy(organizationId: string, projectId: string): Promise<AutomationGuardrailPolicyConfig> {
  await requireProjectInOrg(organizationId, projectId);
  const [latest] = await AutomationGuardrailPolicyModel.initPath({ organization_id: organizationId, project_id: projectId })
    .query()
    .orderBy('set_at', 'desc')
    .limit(1)
    .get();

  if (!latest) {
    return { ...DEFAULT_AUTOMATION_GUARDRAIL_POLICY, setAt: null };
  }
  return {
    maxDailyBudgetChangePct: latest.max_daily_budget_change_pct,
    spendCeilingUsd: latest.spend_ceiling_usd,
    protectedTargetIds: latest.protected_target_ids,
    allowedHours:
      latest.allowed_hours_start_hour_utc !== null && latest.allowed_hours_end_hour_utc !== null
        ? { startHourUtc: latest.allowed_hours_start_hour_utc, endHourUtc: latest.allowed_hours_end_hour_utc }
        : null,
    maxActionsPerDay: latest.max_actions_per_day,
    maxGuardedMetricRegressionPct: latest.max_guarded_metric_regression_pct,
    setAt: latest.set_at,
    ...(latest.set_by_user_id !== undefined ? { setByUserId: latest.set_by_user_id } : {}),
  };
}

/** The pure `@growthos/shared` evaluation shape a resolved {@link AutomationGuardrailPolicyConfig} maps onto. */
export function toPureGuardrailPolicy(policy: AutomationGuardrailPolicyConfig): PureAutomationGuardrailPolicy {
  return {
    maxDailyBudgetChangePct: policy.maxDailyBudgetChangePct,
    spendCeilingUsd: policy.spendCeilingUsd,
    protectedTargetIds: policy.protectedTargetIds,
    allowedHours: policy.allowedHours,
    maxActionsPerDay: policy.maxActionsPerDay,
  };
}

export interface SetAutomationGuardrailPolicyParams {
  organizationId: string;
  projectId: string;
  maxDailyBudgetChangePct: number | null;
  spendCeilingUsd: number | null;
  protectedTargetIds: string[];
  allowedHours: { startHourUtc: number; endHourUtc: number } | null;
  maxActionsPerDay: number | null;
  maxGuardedMetricRegressionPct: number | null;
  setByUserId: string;
}

function requireNonNegative(value: number | null, fieldName: string): void {
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    throw new InvalidAutomationActionError(`${fieldName} must be a non-negative number or null`);
  }
}

/** Records a new guardrail policy config for a project (KAN-71's "guardrail policy engine" AC). Best-effort audit logging, same swallowed-failure posture `setProjectCostQuota` already uses. */
export async function setAutomationGuardrailPolicy(params: SetAutomationGuardrailPolicyParams): Promise<AutomationGuardrailPolicyModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  requireNonNegative(params.maxDailyBudgetChangePct, 'maxDailyBudgetChangePct');
  requireNonNegative(params.spendCeilingUsd, 'spendCeilingUsd');
  requireNonNegative(params.maxActionsPerDay, 'maxActionsPerDay');
  requireNonNegative(params.maxGuardedMetricRegressionPct, 'maxGuardedMetricRegressionPct');
  if (params.allowedHours !== null) {
    const { startHourUtc, endHourUtc } = params.allowedHours;
    if (
      !Number.isInteger(startHourUtc) ||
      !Number.isInteger(endHourUtc) ||
      startHourUtc < 0 ||
      startHourUtc > 23 ||
      endHourUtc < 0 ||
      endHourUtc > 23
    ) {
      throw new InvalidAutomationActionError('allowedHours start/end must be integers between 0 and 23');
    }
  }

  const policy = new AutomationGuardrailPolicyModel();
  policy.organization_id = params.organizationId;
  policy.project_id = params.projectId;
  policy.max_daily_budget_change_pct = params.maxDailyBudgetChangePct;
  policy.spend_ceiling_usd = params.spendCeilingUsd;
  policy.protected_target_ids = params.protectedTargetIds;
  policy.allowed_hours_start_hour_utc = params.allowedHours?.startHourUtc ?? null;
  policy.allowed_hours_end_hour_utc = params.allowedHours?.endHourUtc ?? null;
  policy.max_actions_per_day = params.maxActionsPerDay;
  policy.max_guarded_metric_regression_pct = params.maxGuardedMetricRegressionPct;
  policy.set_at = new Date().toISOString();
  policy.set_by_user_id = params.setByUserId;
  policy.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await policy.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.setByUserId,
      action: 'automation_guardrail_policy.set',
      targetType: 'project',
      targetId: params.projectId,
      summary: `Set the project's automation guardrail policy`,
      after: {
        maxDailyBudgetChangePct: params.maxDailyBudgetChangePct,
        spendCeilingUsd: params.spendCeilingUsd,
        protectedTargetIds: params.protectedTargetIds,
        allowedHours: params.allowedHours,
        maxActionsPerDay: params.maxActionsPerDay,
        maxGuardedMetricRegressionPct: params.maxGuardedMetricRegressionPct,
      },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return policy;
}
