import {
  calculateAutopilotKpis,
  DEFAULT_AUTOPILOT_GUARDRAILS,
  DEFAULT_PIPELINE_STAGES,
  evaluateChannelSpendRebalancing,
  evaluateCreativeFatigueMitigation,
  getBaselineChannels,
  type AutopilotActionRecord,
  type AutopilotChannelId,
  type AutopilotFatigueMitigationItem,
  type AutopilotGuardrails,
  type AutopilotOptimizationCycleResult,
  type AutopilotTelemetryResult,
} from '@growthos/shared';
import { AutopilotActionModel } from '../models/autopilot-action.model';
import { AutopilotConfigModel } from '../models/autopilot-config.model';
import { ProjectModel } from '../models/project.model';
import { AutomationTargetStateModel } from '../models/automation-target-state.model';
import { ProjectNotFoundError } from './resource-library.service';
import { getCreativeFatigueTelemetryForProject } from './creative-fatigue.service';
import { recordAuditLogEntry } from './audit-log.service';

const AUTOPILOT_CONFIG_DOC_ID = 'default';

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

/**
 * Gets or initializes the Autopilot configuration for a project.
 */
export async function getAutopilotConfig(
  organizationId: string,
  projectId: string,
): Promise<AutopilotGuardrails & { autopilotActive: boolean }> {
  await requireProjectInOrg(organizationId, projectId);

  const existing = await AutopilotConfigModel.init(AUTOPILOT_CONFIG_DOC_ID, {
    organization_id: organizationId,
    project_id: projectId,
  });

  if (existing && existing.project_id === projectId) {
    return {
      dailyCapUsd: existing.daily_cap_usd,
      minRoasFloor: existing.min_roas_floor,
      maxCpaCeiling: existing.max_cpa_ceiling,
      maxShiftVelocityPct: existing.max_shift_velocity_pct,
      killSwitchEngaged: existing.kill_switch_engaged,
      autopilotActive: existing.autopilot_active,
    };
  }

  // Initialize default config
  const config = new AutopilotConfigModel();
  config.organization_id = organizationId;
  config.project_id = projectId;
  config.daily_cap_usd = DEFAULT_AUTOPILOT_GUARDRAILS.dailyCapUsd;
  config.min_roas_floor = DEFAULT_AUTOPILOT_GUARDRAILS.minRoasFloor;
  config.max_cpa_ceiling = DEFAULT_AUTOPILOT_GUARDRAILS.maxCpaCeiling;
  config.max_shift_velocity_pct = DEFAULT_AUTOPILOT_GUARDRAILS.maxShiftVelocityPct;
  config.kill_switch_engaged = DEFAULT_AUTOPILOT_GUARDRAILS.killSwitchEngaged;
  config.autopilot_active = true;
  config.updated_at = new Date().toISOString();
  config.setPathParams({ organization_id: organizationId, project_id: projectId });

  await config.save(AUTOPILOT_CONFIG_DOC_ID);

  return {
    ...DEFAULT_AUTOPILOT_GUARDRAILS,
    autopilotActive: true,
  };
}

/**
 * Updates Autopilot guardrails for a project.
 */
export async function updateAutopilotGuardrails(
  organizationId: string,
  projectId: string,
  guardrails: Partial<AutopilotGuardrails>,
  actorId: string = 'system',
): Promise<AutopilotGuardrails & { autopilotActive: boolean }> {
  await requireProjectInOrg(organizationId, projectId);

  const existing = await AutopilotConfigModel.init(AUTOPILOT_CONFIG_DOC_ID, {
    organization_id: organizationId,
    project_id: projectId,
  });

  const config = existing && existing.project_id === projectId ? existing : new AutopilotConfigModel();
  const isNew = config !== existing;

  if (isNew) {
    config.organization_id = organizationId;
    config.project_id = projectId;
    config.daily_cap_usd = DEFAULT_AUTOPILOT_GUARDRAILS.dailyCapUsd;
    config.min_roas_floor = DEFAULT_AUTOPILOT_GUARDRAILS.minRoasFloor;
    config.max_cpa_ceiling = DEFAULT_AUTOPILOT_GUARDRAILS.maxCpaCeiling;
    config.max_shift_velocity_pct = DEFAULT_AUTOPILOT_GUARDRAILS.maxShiftVelocityPct;
    config.kill_switch_engaged = DEFAULT_AUTOPILOT_GUARDRAILS.killSwitchEngaged;
    config.autopilot_active = true;
    config.setPathParams({ organization_id: organizationId, project_id: projectId });
  }

  if (typeof guardrails.dailyCapUsd === 'number') config.daily_cap_usd = guardrails.dailyCapUsd;
  if (typeof guardrails.minRoasFloor === 'number') config.min_roas_floor = guardrails.minRoasFloor;
  if (typeof guardrails.maxCpaCeiling === 'number') config.max_cpa_ceiling = guardrails.maxCpaCeiling;
  if (typeof guardrails.maxShiftVelocityPct === 'number') config.max_shift_velocity_pct = guardrails.maxShiftVelocityPct;
  if (typeof guardrails.killSwitchEngaged === 'boolean') config.kill_switch_engaged = guardrails.killSwitchEngaged;

  config.updated_at = new Date().toISOString();
  config.updated_by_user_id = actorId;

  await config.save(AUTOPILOT_CONFIG_DOC_ID);

  try {
    await recordAuditLogEntry({
      organizationId,
      projectId,
      actorType: 'user',
      actorId,
      action: 'ad_autopilot.update_guardrails',
      targetType: 'autopilot_config',
      targetId: AUTOPILOT_CONFIG_DOC_ID,
      summary: `Updated Ad Studio Autopilot guardrails: Daily Cap $${config.daily_cap_usd}, Min ROAS ${config.min_roas_floor}x`,
      after: {
        daily_cap_usd: config.daily_cap_usd,
        min_roas_floor: config.min_roas_floor,
        max_cpa_ceiling: config.max_cpa_ceiling,
        max_shift_velocity_pct: config.max_shift_velocity_pct,
        kill_switch_engaged: config.kill_switch_engaged,
      },
    });
  } catch {
    // Best-effort audit log
  }

  return {
    dailyCapUsd: config.daily_cap_usd,
    minRoasFloor: config.min_roas_floor,
    maxCpaCeiling: config.max_cpa_ceiling,
    maxShiftVelocityPct: config.max_shift_velocity_pct,
    killSwitchEngaged: config.kill_switch_engaged,
    autopilotActive: config.autopilot_active,
  };
}

/**
 * Toggles emergency kill-switch or pauses/resumes autopilot execution.
 */
export async function toggleAutopilotKillSwitch(
  organizationId: string,
  projectId: string,
  engaged: boolean,
  reason: string = 'User triggered emergency kill switch',
  actorId: string = 'system',
): Promise<void> {
  await requireProjectInOrg(organizationId, projectId);

  await updateAutopilotGuardrails(organizationId, projectId, { killSwitchEngaged: engaged }, actorId);

  const action = new AutopilotActionModel();
  action.organization_id = organizationId;
  action.project_id = projectId;
  action.action_type = 'kill_switch_pause';
  action.channel = 'all';
  action.before_budget_usd = 0;
  action.after_budget_usd = 0;
  action.delta_pct = engaged ? -100 : 0;
  action.reason = reason;
  action.impact = engaged ? 'Halted all autonomous spend reallocation' : 'Resumed autonomous operations';
  action.status = 'executed';
  action.executed_at = new Date().toISOString();
  action.executed_by_user_id = actorId;
  action.setPathParams({ organization_id: organizationId, project_id: projectId });

  await action.save();
}

/**
 * Retrieves comprehensive live Autopilot telemetry, active channels, fatigue alerts, and action history.
 */
export async function getAutopilotTelemetry(
  organizationId: string,
  projectId: string,
): Promise<AutopilotTelemetryResult> {
  await requireProjectInOrg(organizationId, projectId);

  const config = await getAutopilotConfig(organizationId, projectId);

  // 1. Query Fatigue Telemetry
  let fatigueAlerts: AutopilotFatigueMitigationItem[] = [];
  try {
    const fatigueResult = await getCreativeFatigueTelemetryForProject(organizationId, projectId, { limit: 100 });
    if (fatigueResult.hasData) {
      fatigueAlerts = fatigueResult.creatives.map((c) => ({
        id: c.id,
        creativeId: c.creativeId,
        creativeName: c.creativeName,
        channel: c.channel,
        frequency: c.frequency,
        currentCtrPct: c.currentCtrPct,
        baselineCtrPct: c.baselineCtrPct,
        decayPct: c.decayPct,
        fatigueLevel: c.fatigueLevel,
        recommendedAction: c.recommendedAction,
        timestamp: c.landedAt,
      }));
    }
  } catch {
    fatigueAlerts = [];
  }

  // 2. Query Automation Targets to identify active connected channels
  let channels = getBaselineChannels();
  let hasRealTargets = false;

  try {
    const targets = await AutomationTargetStateModel.initPath({
      organization_id: organizationId,
      project_id: projectId,
    })
      .where('project_id', '==', projectId)
      .get();

    if (targets && targets.length > 0) {
      hasRealTargets = true;
      const channelSpendMap: Record<AutopilotChannelId, number> = {
        google_ads: 0,
        meta_ads: 0,
        tiktok: 0,
        connected_tv: 0,
      };

      for (const t of targets) {
        const platform = t.external_platform;
        const budget = Number(t.daily_budget_usd ?? 0);
        if (platform === 'google_ads') {
          channelSpendMap.google_ads += budget;
        } else if (platform === 'meta_ads') {
          channelSpendMap.meta_ads += budget;
        } else if (t.label && t.label.toLowerCase().includes('tiktok')) {
          channelSpendMap.tiktok += budget;
        } else {
          channelSpendMap.connected_tv += budget;
        }
      }

      const totalTargetSpend = Object.values(channelSpendMap).reduce((sum, v) => sum + v, 0);

      if (totalTargetSpend > 0) {
        channels = channels.map((ch) => {
          const spend = channelSpendMap[ch.channel] > 0 ? channelSpendMap[ch.channel] : ch.dailySpendUsd;
          return {
            ...ch,
            dailySpendUsd: spend,
            spendSharePct: Number(((spend / totalTargetSpend) * 100).toFixed(1)),
          };
        });
      }
    }
  } catch {
    // Keep baseline channels
  }

  // 3. Query Recent Autopilot Action Ledger
  let recentActions: AutopilotActionRecord[] = [];
  try {
    const actions = await AutopilotActionModel.initPath({
      organization_id: organizationId,
      project_id: projectId,
    })
      .where('project_id', '==', projectId)
      .get();

    if (actions && actions.length > 0) {
      // Sort newest first
      actions.sort((a: AutopilotActionModel, b: AutopilotActionModel) => b.executed_at.localeCompare(a.executed_at));
      recentActions = actions.slice(0, 50).map((a: AutopilotActionModel) => ({
        id: a.id,
        timestamp: a.executed_at,
        actionType: a.action_type as AutopilotActionRecord['actionType'],
        channel: a.channel,
        targetCampaignId: a.target_campaign_id,
        beforeBudgetUsd: a.before_budget_usd,
        afterBudgetUsd: a.after_budget_usd,
        deltaPct: a.delta_pct,
        reason: a.reason,
        impact: a.impact,
        status: a.status,
        executedBy: a.executed_by_user_id,
      }));
    }
  } catch {
    recentActions = [];
  }

  const guardrails: AutopilotGuardrails = {
    dailyCapUsd: config.dailyCapUsd,
    minRoasFloor: config.minRoasFloor,
    maxCpaCeiling: config.maxCpaCeiling,
    maxShiftVelocityPct: config.maxShiftVelocityPct,
    killSwitchEngaged: config.killSwitchEngaged,
  };

  const kpis = calculateAutopilotKpis(channels, guardrails);

  return {
    hasData: hasRealTargets || recentActions.length > 0,
    autopilotActive: config.autopilotActive && !config.killSwitchEngaged,
    killSwitchTriggered: config.killSwitchEngaged,
    kpis,
    channels,
    fatigueAlerts,
    pipelineStages: DEFAULT_PIPELINE_STAGES,
    recentActions,
    guardrails,
  };
}

/**
 * Executes a full 5-stage autonomous optimization cycle:
 * Ingests telemetry, rebalances budgets across channels, mitigates creative wear-out,
 * saves actions to the audit ledger, and returns the result.
 */
export async function executeAutopilotOptimizationCycle(
  organizationId: string,
  projectId: string,
  actorId: string = 'autopilot_engine',
): Promise<AutopilotOptimizationCycleResult> {
  await requireProjectInOrg(organizationId, projectId);

  const initialTelemetry = await getAutopilotTelemetry(organizationId, projectId);
  const guardrails = initialTelemetry.guardrails;

  // 1. Channel Spend Rebalancing
  const { updatedChannels, proposals: rebalanceProposals } = evaluateChannelSpendRebalancing(
    initialTelemetry.channels,
    guardrails,
  );

  // 2. Fatigue Mitigation
  const fatigueProposals = evaluateCreativeFatigueMitigation(
    initialTelemetry.fatigueAlerts.map((f) => ({
      creativeId: f.creativeId,
      creativeName: f.creativeName,
      channel: f.channel,
      frequency: f.frequency,
      decayPct: f.decayPct,
    })),
  );

  const now = new Date().toISOString();
  const actionsGenerated: AutopilotActionRecord[] = [];

  // Persist rebalance actions to Firestore
  for (const p of rebalanceProposals) {
    if (p.deltaUsd === 0) continue;

    const action = new AutopilotActionModel();
    action.organization_id = organizationId;
    action.project_id = projectId;
    action.action_type = 'budget_rebalance';
    action.channel = p.channel;
    action.before_budget_usd = p.beforeDailySpendUsd;
    action.after_budget_usd = p.proposedDailySpendUsd;
    action.delta_pct = p.deltaPct;
    action.reason = p.reason;
    action.impact = p.impact;
    action.status = 'executed';
    action.executed_at = now;
    action.executed_by_user_id = actorId;
    action.setPathParams({ organization_id: organizationId, project_id: projectId });

    await action.save();

    actionsGenerated.push({
      id: action.id,
      timestamp: action.executed_at,
      actionType: 'budget_rebalance',
      channel: action.channel,
      beforeBudgetUsd: action.before_budget_usd,
      afterBudgetUsd: action.after_budget_usd,
      deltaPct: action.delta_pct,
      reason: action.reason,
      impact: action.impact,
      status: 'executed',
      executedBy: actorId,
    });
  }

  // Persist fatigue mitigation actions
  for (const fp of fatigueProposals) {
    const action = new AutopilotActionModel();
    action.organization_id = organizationId;
    action.project_id = projectId;
    action.action_type = fp.action === 'auto_swap' ? 'creative_swap' : 'frequency_cap_throttle';
    action.channel = fp.channel;
    action.target_campaign_id = fp.creativeId;
    action.before_budget_usd = 0;
    action.after_budget_usd = 0;
    action.delta_pct = fp.action === 'auto_swap' ? 0 : -20;
    action.reason = fp.reason;
    action.impact = `Mitigated asset wear-out for ${fp.creativeName}`;
    action.status = 'executed';
    action.executed_at = now;
    action.executed_by_user_id = actorId;
    action.setPathParams({ organization_id: organizationId, project_id: projectId });

    await action.save();

    actionsGenerated.push({
      id: action.id,
      timestamp: action.executed_at,
      actionType: action.action_type as AutopilotActionRecord['actionType'],
      channel: action.channel,
      targetCampaignId: action.target_campaign_id,
      beforeBudgetUsd: 0,
      afterBudgetUsd: 0,
      deltaPct: action.delta_pct,
      reason: action.reason,
      impact: action.impact,
      status: 'executed',
      executedBy: actorId,
    });
  }

  // Log to audit log
  try {
    await recordAuditLogEntry({
      organizationId,
      projectId,
      actorType: 'system',
      actorId,
      action: 'ad_autopilot.execute_optimization_cycle',
      targetType: 'autopilot',
      targetId: 'ad_autopilot',
      summary: `Autonomous optimization cycle executed: ${rebalanceProposals.length} budget rebalances, ${fatigueProposals.length} fatigue mitigations`,
    });
  } catch {
    // Best-effort audit log
  }

  const newTelemetry: AutopilotTelemetryResult = {
    ...initialTelemetry,
    hasData: true,
    channels: updatedChannels,
    kpis: calculateAutopilotKpis(updatedChannels, guardrails),
    recentActions: [...actionsGenerated, ...initialTelemetry.recentActions],
  };

  return {
    executionId: `cycle_${Date.now()}`,
    executedAt: now,
    guardrailsChecked: guardrails,
    rebalanceProposals,
    fatigueMitigationProposals: fatigueProposals,
    actionsGenerated,
    pipelineStages: DEFAULT_PIPELINE_STAGES,
    newTelemetry,
  };
}

/**
 * Rolls back a previously executed Autopilot action.
 */
export async function rollbackAutopilotAction(
  organizationId: string,
  projectId: string,
  actionId: string,
  actorId: string = 'system',
): Promise<AutopilotActionRecord> {
  await requireProjectInOrg(organizationId, projectId);

  const action = await AutopilotActionModel.init(actionId, {
    organization_id: organizationId,
    project_id: projectId,
  });

  if (!action || action.project_id !== projectId) {
    throw new Error(`Autopilot action "${actionId}" not found`);
  }

  action.status = 'rolled_back';
  action.rolled_back_at = new Date().toISOString();
  action.rolled_back_by_user_id = actorId;

  await action.save(actionId);

  try {
    await recordAuditLogEntry({
      organizationId,
      projectId,
      actorType: 'user',
      actorId,
      action: 'ad_autopilot.rollback_action',
      targetType: 'autopilot_action',
      targetId: actionId,
      summary: `Rolled back autonomous ${action.action_type} on channel ${action.channel}`,
    });
  } catch {
    // Best-effort
  }

  return {
    id: action.id,
    timestamp: action.executed_at,
    actionType: action.action_type as AutopilotActionRecord['actionType'],
    channel: action.channel,
    targetCampaignId: action.target_campaign_id,
    beforeBudgetUsd: action.before_budget_usd,
    afterBudgetUsd: action.after_budget_usd,
    deltaPct: action.delta_pct,
    reason: `Rolled back: ${action.reason}`,
    impact: `Reverted action effect`,
    status: 'rolled_back',
    executedBy: action.executed_by_user_id,
  };
}
