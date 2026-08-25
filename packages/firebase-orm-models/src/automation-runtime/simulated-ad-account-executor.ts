import { AutomationTargetStateModel } from '../models/automation-target-state.model';
import { AutomationTargetNotFoundError } from '../services/automation-errors';
import type {
  AutomationActionExecutor,
  AutomationBudgetChangeExecutionInput,
  AutomationBudgetChangeExecutionResult,
  AutomationCampaignActivationExecutionInput,
  AutomationCampaignDraftCreateExecutionInput,
  AutomationCampaignDraftCreateExecutionResult,
  AutomationCampaignDraftRollbackInput,
  AutomationKeywordEditExecutionInput,
  AutomationKeywordEditExecutionResult,
  AutomationKeywordEditRollbackInput,
} from './executor';

interface TargetLookup {
  organizationId: string;
  projectId: string;
  targetId: string;
}

async function loadTarget(input: TargetLookup): Promise<AutomationTargetStateModel> {
  const target = await AutomationTargetStateModel.init(input.targetId, {
    organization_id: input.organizationId,
    project_id: input.projectId,
  });
  if (!target || target.project_id !== input.projectId) {
    throw new AutomationTargetNotFoundError(input.targetId);
  }
  return target;
}

/**
 * The buildable-today stand-in `AutomationActionExecutor` — mutates
 * {@link AutomationTargetStateModel} (this codebase's simulated "live ad
 * platform state") instead of calling a real ad platform API, the same
 * "actually works against a real stand-in" posture `LocalDbtOrchestrationExecutor`
 * (KAN-38) established rather than `NotConfiguredWarehouseQueryExecutor`'s
 * (KAN-42) pure no-op — so KAN-71's execute -> verify -> rollback pipeline has
 * something real to prove out end to end (the "rollback restores prior
 * state" AC) before KAN-72/KAN-73 exist.
 */
export class SimulatedAdAccountExecutor implements AutomationActionExecutor {
  async executeBudgetChange(input: AutomationBudgetChangeExecutionInput): Promise<AutomationBudgetChangeExecutionResult> {
    const target = await loadTarget(input);
    target.daily_budget_usd = input.afterDailyBudgetUsd;
    target.updated_at = new Date().toISOString();
    await target.save();
    return { actualDailyBudgetUsd: target.daily_budget_usd };
  }

  async rollbackBudgetChange(input: AutomationBudgetChangeExecutionInput): Promise<AutomationBudgetChangeExecutionResult> {
    const target = await loadTarget(input);
    target.daily_budget_usd = input.beforeDailyBudgetUsd;
    target.updated_at = new Date().toISOString();
    await target.save();
    return { actualDailyBudgetUsd: target.daily_budget_usd };
  }

  async executeCampaignDraftCreate(
    input: AutomationCampaignDraftCreateExecutionInput,
  ): Promise<AutomationCampaignDraftCreateExecutionResult> {
    const target = await loadTarget(input);
    const campaignResourceName = `customers/simulated/campaigns/${target.id}`;
    target.campaign_resource_name = campaignResourceName;
    target.campaign_budget_resource_name = `customers/simulated/campaignBudgets/${target.id}`;
    target.campaign_status = 'paused';
    target.daily_budget_usd = input.draft.dailyBudgetUsd;
    // Meta drafts have no ad-group concept (see `MetaAutomationActionExecutor`'s own doc comment) —
    // only a Google Ads draft's `adGroups` gets simulated ad-group resource names.
    if (input.draft.platform !== 'meta') {
      target.ad_group_resource_names = input.draft.adGroups.map((_adGroup, index) => `customers/simulated/adGroups/${target.id}-${index}`);
    }
    target.updated_at = new Date().toISOString();
    await target.save();
    return { campaignResourceName };
  }

  async rollbackCampaignDraftCreate(input: AutomationCampaignDraftRollbackInput): Promise<void> {
    const target = await loadTarget(input);
    target.campaign_status = 'removed';
    target.updated_at = new Date().toISOString();
    await target.save();
  }

  async executeCampaignActivation(input: AutomationCampaignActivationExecutionInput): Promise<void> {
    const target = await loadTarget(input);
    target.campaign_status = 'enabled';
    target.updated_at = new Date().toISOString();
    await target.save();
  }

  async rollbackCampaignActivation(input: AutomationCampaignActivationExecutionInput): Promise<void> {
    const target = await loadTarget(input);
    target.campaign_status = 'paused';
    target.updated_at = new Date().toISOString();
    await target.save();
  }

  async executeKeywordEdit(input: AutomationKeywordEditExecutionInput): Promise<AutomationKeywordEditExecutionResult> {
    const target = await loadTarget(input);
    const addedKeywordResourceNames = input.addKeywords.map((_keyword, index) => `customers/simulated/adGroupCriteria/${target.id}-kw-${index}`);
    const addedNegativeKeywordResourceNames = input.addNegativeKeywords.map(
      (_keyword, index) => `customers/simulated/adGroupCriteria/${target.id}-neg-${index}`,
    );
    target.updated_at = new Date().toISOString();
    await target.save();
    return { addedKeywordResourceNames, addedNegativeKeywordResourceNames };
  }

  async rollbackKeywordEdit(input: AutomationKeywordEditRollbackInput): Promise<void> {
    const target = await loadTarget(input);
    target.updated_at = new Date().toISOString();
    await target.save();
  }
}

export const defaultAutomationActionExecutor: AutomationActionExecutor = new SimulatedAdAccountExecutor();
