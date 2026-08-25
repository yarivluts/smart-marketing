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
  type AutomationKeywordEditExecutionInput,
  type AutomationKeywordEditExecutionResult,
  type AutomationKeywordEditRollbackInput,
} from '../../automation-runtime';
import type { GoogleAdsApiClient } from './api-client';

/** A `budget_change` action was proposed against a target whose Google Ads budget-resource name is unknown and couldn't be resolved via a live GAQL lookup either (e.g. the target's id/`campaign_resource_name` doesn't correspond to a real campaign on this Google Ads account). */
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
    const budgetResourceName = await this.resolveCampaignBudgetResourceName(target);
    await this.apiClient.setCampaignBudgetAmount(this.customerId, budgetResourceName, input.afterDailyBudgetUsd);
    target.daily_budget_usd = input.afterDailyBudgetUsd;
    target.updated_at = new Date().toISOString();
    await target.save();
    return { actualDailyBudgetUsd: input.afterDailyBudgetUsd };
  }

  async rollbackBudgetChange(input: AutomationBudgetChangeExecutionInput): Promise<AutomationBudgetChangeExecutionResult> {
    const target = await loadTarget(input);
    const budgetResourceName = await this.resolveCampaignBudgetResourceName(target);
    await this.apiClient.setCampaignBudgetAmount(this.customerId, budgetResourceName, input.beforeDailyBudgetUsd);
    target.daily_budget_usd = input.beforeDailyBudgetUsd;
    target.updated_at = new Date().toISOString();
    await target.save();
    return { actualDailyBudgetUsd: input.beforeDailyBudgetUsd };
  }

  /**
   * Returns the target's known budget-resource name, or — for a target
   * seeded to represent a pre-existing campaign this plugin never created
   * via `campaign_draft_create` (its id *is* the campaign's own resource
   * name in that case, see `AutomationTargetStateModel`'s own doc comment) —
   * resolves it via a live GAQL lookup and caches both resource names on the
   * target (not yet saved; the caller's own subsequent `target.save()`
   * persists it alongside the budget change itself). Throws
   * `GoogleAdsBudgetResourceUnknownError` if the lookup itself fails.
   */
  private async resolveCampaignBudgetResourceName(target: AutomationTargetStateModel): Promise<string> {
    if (target.campaign_budget_resource_name) {
      return target.campaign_budget_resource_name;
    }
    const campaignResourceName = target.campaign_resource_name ?? target.id;
    let budgetResourceName: string;
    try {
      budgetResourceName = await this.apiClient.lookupCampaignBudgetResourceName(this.customerId, campaignResourceName);
    } catch {
      throw new GoogleAdsBudgetResourceUnknownError(target.id);
    }
    target.campaign_resource_name = campaignResourceName;
    target.campaign_budget_resource_name = budgetResourceName;
    return budgetResourceName;
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
    target.ad_group_resource_names = result.adGroupResourceNames;
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

  async executeKeywordEdit(input: AutomationKeywordEditExecutionInput): Promise<AutomationKeywordEditExecutionResult> {
    const target = await loadTarget(input);
    const result = await this.apiClient.addAdGroupKeywords(this.customerId, input.adGroupResourceName, input.addKeywords, input.addNegativeKeywords);
    target.updated_at = new Date().toISOString();
    await target.save();
    return { addedKeywordResourceNames: result.keywordResourceNames, addedNegativeKeywordResourceNames: result.negativeKeywordResourceNames };
  }

  async rollbackKeywordEdit(input: AutomationKeywordEditRollbackInput): Promise<void> {
    const target = await loadTarget(input);
    const criterionResourceNames = [...input.addedKeywordResourceNames, ...input.addedNegativeKeywordResourceNames];
    if (criterionResourceNames.length > 0) {
      await this.apiClient.removeAdGroupCriteria(this.customerId, criterionResourceNames);
    }
    target.updated_at = new Date().toISOString();
    await target.save();
  }
}
