import { AutomationTargetStateModel } from '../../models/automation-target-state.model';
import { AutomationTargetNotFoundError } from '../../services/automation-errors';
import {
  validateCampaignDraft,
  type AutomationActionExecutor,
  type AutomationBudgetChangeExecutionInput,
  type AutomationBudgetChangeExecutionResult,
  type AutomationCampaignActivationExecutionInput,
  type AutomationCampaignDraftCreateExecutionInput,
  type AutomationCampaignDraftCreateExecutionResult,
  type AutomationCampaignDraftRollbackInput,
} from '../../automation-runtime';
import type { GoogleAdsApiClient } from './api-client';

/** A `budget_change` action was proposed against a target with no known Google Ads budget-resource name — see `AutomationTargetStateModel.campaign_budget_resource_name`'s own doc comment for why this isn't looked up on demand yet. */
export class GoogleAdsBudgetResourceUnknownError extends Error {
  constructor(targetId: string) {
    super(
      `Automation target "${targetId}" has no known Google Ads budget resource name — a budget_change action against a Google Ads target is only supported for a campaign this plugin itself created via campaign_draft_create.`,
    );
    this.name = 'GoogleAdsBudgetResourceUnknownError';
  }
}

/**
 * A `campaign_draft_create` action reached `GoogleAdsAutomationActionExecutor`
 * with a `platform: 'meta'` draft (KAN-73) — should never happen if
 * `resolveAutomationActionExecutorForTarget` resolved the right executor for
 * the target's linked credential, but this is defense in depth, not the only
 * check: cross-provider isolation must hold even if a caller wires the wrong
 * executor to a target directly (e.g. a future test, or a bug in the
 * resolver).
 */
export class GoogleAdsWrongPlatformCampaignDraftError extends Error {
  constructor() {
    super('GoogleAdsAutomationActionExecutor can only execute a campaign draft with platform: "google_ads".');
    this.name = 'GoogleAdsWrongPlatformCampaignDraftError';
  }
}

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
 * The real Google Ads `AutomationActionExecutor` (KAN-72) — the seam
 * `automation-runtime/executor.ts`'s own doc comment names as what KAN-72
 * (and its Meta sibling, `MetaAutomationActionExecutor`, KAN-73) implements
 * "for real". Resolved per-target by `resolveAutomationActionExecutorForTarget`
 * (`services/automation-executor-resolver.service.ts`) whenever a target's
 * linked connection (`ResourceAttachmentModel`) is a `provider: 'google_ads'`
 * credential; falls back to `SimulatedAdAccountExecutor` for every other
 * target, same as before this story existed. `executeCampaignDraftCreate`
 * guards `input.draft.platform === 'google_ads'` before narrowing — defense
 * in depth so a `platform: 'meta'` draft can never reach the Google Ads API
 * client even if the resolver ever mis-wires an executor.
 */
export class GoogleAdsAutomationActionExecutor implements AutomationActionExecutor {
  constructor(
    private readonly apiClient: GoogleAdsApiClient,
    private readonly customerId: string,
  ) {}

  async executeBudgetChange(input: AutomationBudgetChangeExecutionInput): Promise<AutomationBudgetChangeExecutionResult> {
    const target = await loadTarget(input);
    if (!target.campaign_budget_resource_name) {
      throw new GoogleAdsBudgetResourceUnknownError(input.targetId);
    }
    await this.apiClient.setCampaignBudgetAmount(this.customerId, target.campaign_budget_resource_name, input.afterDailyBudgetUsd);
    target.daily_budget_usd = input.afterDailyBudgetUsd;
    target.updated_at = new Date().toISOString();
    await target.save();
    return { actualDailyBudgetUsd: input.afterDailyBudgetUsd };
  }

  async rollbackBudgetChange(input: AutomationBudgetChangeExecutionInput): Promise<AutomationBudgetChangeExecutionResult> {
    const target = await loadTarget(input);
    if (!target.campaign_budget_resource_name) {
      throw new GoogleAdsBudgetResourceUnknownError(input.targetId);
    }
    await this.apiClient.setCampaignBudgetAmount(this.customerId, target.campaign_budget_resource_name, input.beforeDailyBudgetUsd);
    target.daily_budget_usd = input.beforeDailyBudgetUsd;
    target.updated_at = new Date().toISOString();
    await target.save();
    return { actualDailyBudgetUsd: input.beforeDailyBudgetUsd };
  }

  async executeCampaignDraftCreate(
    input: AutomationCampaignDraftCreateExecutionInput,
  ): Promise<AutomationCampaignDraftCreateExecutionResult> {
    validateCampaignDraft(input.draft);
    const target = await loadTarget(input);
    if (input.draft.platform !== 'google_ads') {
      throw new GoogleAdsWrongPlatformCampaignDraftError();
    }
    const result = await this.apiClient.createCampaignDraft(this.customerId, input.draft);
    target.campaign_resource_name = result.campaignResourceName;
    target.campaign_budget_resource_name = result.campaignBudgetResourceName;
    target.campaign_status = 'paused';
    target.daily_budget_usd = input.draft.dailyBudgetUsd;
    target.updated_at = new Date().toISOString();
    await target.save();
    return { campaignResourceName: result.campaignResourceName };
  }

  async rollbackCampaignDraftCreate(input: AutomationCampaignDraftRollbackInput): Promise<void> {
    const target = await loadTarget(input);
    await this.apiClient.setCampaignStatus(this.customerId, input.campaignResourceName, 'REMOVED');
    target.campaign_status = 'removed';
    target.updated_at = new Date().toISOString();
    await target.save();
  }

  async executeCampaignActivation(input: AutomationCampaignActivationExecutionInput): Promise<void> {
    const target = await loadTarget(input);
    await this.apiClient.setCampaignStatus(this.customerId, input.campaignResourceName, 'ENABLED');
    target.campaign_status = 'enabled';
    target.updated_at = new Date().toISOString();
    await target.save();
  }

  async rollbackCampaignActivation(input: AutomationCampaignActivationExecutionInput): Promise<void> {
    const target = await loadTarget(input);
    await this.apiClient.setCampaignStatus(this.customerId, input.campaignResourceName, 'PAUSED');
    target.campaign_status = 'paused';
    target.updated_at = new Date().toISOString();
    await target.save();
  }
}
