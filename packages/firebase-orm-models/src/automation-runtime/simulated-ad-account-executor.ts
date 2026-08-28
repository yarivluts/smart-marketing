import { AutomationTargetStateModel } from '../models/automation-target-state.model';
import { AutomationTargetNotFoundError } from '../services/automation-errors';
import type {
  AutomationActionExecutor,
  AutomationAdEditExecutionInput,
  AutomationAdEditExecutionResult,
  AutomationAdEditRollbackInput,
  AutomationBudgetChangeExecutionInput,
  AutomationBudgetChangeExecutionResult,
  AutomationCampaignActivationExecutionInput,
  AutomationCampaignStateReadInput,
  AutomationCampaignStateReadResult,
  AutomationCampaignDraftCreateExecutionInput,
  AutomationCampaignDraftCreateExecutionResult,
  AutomationCampaignDraftRollbackInput,
  AutomationKeywordEditExecutionInput,
  AutomationKeywordEditExecutionResult,
  AutomationKeywordEditRollbackInput,
  AutomationMetaAdCreativeEditExecutionInput,
  AutomationMetaAdCreativeEditExecutionResult,
  AutomationMetaAdCreativeEditRollbackInput,
  AutomationMetaAdSetEditExecutionInput,
  AutomationMetaAdSetEditExecutionResult,
  AutomationMetaAdSetEditRollbackInput,
  AutomationMetaAdSetTargetingEditExecutionInput,
  AutomationMetaAdSetTargetingEditExecutionResult,
  AutomationMetaAdSetTargetingEditRollbackInput,
} from './executor';

/** A plausible "previous" targeting spec for a demo/simulated target with no real per-ad-set targeting tracked on `AutomationTargetStateModel` — same fabrication posture `executeMetaAdCreativeEdit`'s own doc comment establishes for its simulated "previous" creative id. */
const SIMULATED_PREVIOUS_TARGETING = { countries: ['US'], ageMin: 18, ageMax: 65 };

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
    // only a Google Ads draft's `adGroups` gets simulated ad-group resource names, and only a Meta
    // draft's `adSets` gets simulated ad-set resource names (KAN-73 follow-up).
    if (input.draft.platform === 'meta') {
      target.meta_ad_set_resource_names = input.draft.adSets.map((_adSet, index) => `act/simulated/adSets/${target.id}-${index}`);
      target.meta_ad_resource_names = input.draft.adSets.map((_adSet, index) => `act/simulated/ads/${target.id}-${index}`);
    } else {
      target.ad_group_resource_names = input.draft.adGroups.map((_adGroup, index) => `customers/simulated/adGroups/${target.id}-${index}`);
      target.ad_resource_names = input.draft.adGroups.map((_adGroup, index) => `customers/simulated/adGroupAds/${target.id}-${index}`);
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

  async executeAdEdit(input: AutomationAdEditExecutionInput): Promise<AutomationAdEditExecutionResult> {
    const target = await loadTarget(input);
    const adIndex = target.ad_resource_names?.indexOf(input.previousAdResourceName) ?? -1;
    const newAdResourceName = `customers/simulated/adGroupAds/${target.id}-edit-${Date.now()}`;
    if (adIndex !== -1) {
      const nextAdResourceNames = [...(target.ad_resource_names ?? [])];
      nextAdResourceNames[adIndex] = newAdResourceName;
      target.ad_resource_names = nextAdResourceNames;
    }
    target.updated_at = new Date().toISOString();
    await target.save();
    return { newAdResourceName };
  }

  async rollbackAdEdit(input: AutomationAdEditRollbackInput): Promise<void> {
    const target = await loadTarget(input);
    const adIndex = target.ad_resource_names?.indexOf(input.newAdResourceName) ?? -1;
    if (adIndex !== -1) {
      const nextAdResourceNames = [...(target.ad_resource_names ?? [])];
      nextAdResourceNames[adIndex] = input.previousAdResourceName;
      target.ad_resource_names = nextAdResourceNames;
    }
    target.updated_at = new Date().toISOString();
    await target.save();
  }

  /**
   * No per-ad-set budget/status is tracked on `AutomationTargetStateModel`
   * (KAN-73 follow-up's own `AutomationMetaAdSetEditExecutionInput` doc
   * comment explains why a real Meta connector needs a live lookup instead),
   * so this stand-in reports the target's own campaign-level fields as the
   * simulated "previous" values — plausible for a demo/simulated target
   * without a real per-ad-set state to snapshot.
   */
  async executeMetaAdSetEdit(input: AutomationMetaAdSetEditExecutionInput): Promise<AutomationMetaAdSetEditExecutionResult> {
    const target = await loadTarget(input);
    const result: AutomationMetaAdSetEditExecutionResult = {};
    if (input.dailyBudgetUsd !== undefined) {
      result.previousDailyBudgetUsd = target.daily_budget_usd;
    }
    if (input.status !== undefined) {
      result.previousStatus = target.campaign_status === 'enabled' ? 'enabled' : 'paused';
    }
    target.updated_at = new Date().toISOString();
    await target.save();
    return result;
  }

  async rollbackMetaAdSetEdit(input: AutomationMetaAdSetEditRollbackInput): Promise<void> {
    const target = await loadTarget(input);
    target.updated_at = new Date().toISOString();
    await target.save();
  }

  /** No per-ad-set live targeting spec is tracked on `AutomationTargetStateModel` (a real Meta connector needs a live lookup, see `MetaAutomationActionExecutor.executeMetaAdSetTargetingEdit`'s own doc comment), so this stand-in reports a fixed plausible "previous" spec for a demo/simulated target without a real one to snapshot. */
  async executeMetaAdSetTargetingEdit(input: AutomationMetaAdSetTargetingEditExecutionInput): Promise<AutomationMetaAdSetTargetingEditExecutionResult> {
    const target = await loadTarget(input);
    target.updated_at = new Date().toISOString();
    await target.save();
    return { previousTargeting: SIMULATED_PREVIOUS_TARGETING };
  }

  async rollbackMetaAdSetTargetingEdit(input: AutomationMetaAdSetTargetingEditRollbackInput): Promise<void> {
    const target = await loadTarget(input);
    target.updated_at = new Date().toISOString();
    await target.save();
  }

  /** No per-ad live creative is tracked on `AutomationTargetStateModel` (a real Meta connector needs a live lookup, see `MetaAutomationActionExecutor.executeMetaAdCreativeEdit`'s own doc comment), so this stand-in fabricates a plausible "previous" creative id for a demo/simulated target without a real one to snapshot. */
  async executeMetaAdCreativeEdit(input: AutomationMetaAdCreativeEditExecutionInput): Promise<AutomationMetaAdCreativeEditExecutionResult> {
    const target = await loadTarget(input);
    const newCreativeResourceName = `act/simulated/adCreatives/${target.id}-edit-${Date.now()}`;
    target.updated_at = new Date().toISOString();
    await target.save();
    return { previousCreativeResourceName: `act/simulated/adCreatives/${target.id}`, newCreativeResourceName };
  }

  async rollbackMetaAdCreativeEdit(input: AutomationMetaAdCreativeEditRollbackInput): Promise<void> {
    const target = await loadTarget(input);
    target.updated_at = new Date().toISOString();
    await target.save();
  }

  /** The target row IS the simulated platform, so a "live read" reports the row itself — stamping `last_read_state_at` (and deliberately NOT `updated_at`, which stays "last executed action") is the whole side effect. */
  async readCampaignState(input: AutomationCampaignStateReadInput): Promise<AutomationCampaignStateReadResult> {
    const target = await loadTarget(input);
    target.last_read_state_at = new Date().toISOString();
    await target.save();
    return { campaignStatus: target.campaign_status ?? null, dailyBudgetUsd: target.daily_budget_usd };
  }
}

export const defaultAutomationActionExecutor: AutomationActionExecutor = new SimulatedAdAccountExecutor();
