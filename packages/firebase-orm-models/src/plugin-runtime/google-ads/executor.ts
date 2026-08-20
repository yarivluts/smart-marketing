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

/**
 * A `budget_change` action was proposed against a target whose campaign
 * resource name (the target's own id, or `campaign_resource_name` once a
 * `campaign_draft_create` action has run — see
 * `AutomationTargetStateModel.campaign_budget_resource_name`'s own doc
 * comment) doesn't resolve to a real Google Ads campaign for this customer:
 * either the id was never a real campaign, or it belongs to a different
 * Google Ads customer than the one this executor is authenticated as.
 */
export class GoogleAdsBudgetResourceUnknownError extends Error {
  constructor(targetId: string) {
    super(
      `Automation target "${targetId}" doesn't resolve to a Google Ads campaign with a known budget resource — a budget_change action needs either a campaign this plugin itself created via campaign_draft_create, or a target id/campaign_resource_name that is a real campaign resource name for this customer.`,
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
 * Resolves (and, on first resolution, persists onto `target`) the Google Ads
 * budget resource name a `budget_change` action should mutate. A target this
 * plugin itself created via `campaign_draft_create` already has
 * `campaign_budget_resource_name` set and short-circuits here with no API
 * call. A target seeded to represent a pre-existing campaign never has it
 * set — for that case, `target.campaign_resource_name` (or, absent that, the
 * target's own id — see `AutomationTargetStateModel`'s own doc comment for
 * why the id doubles as the resource name in that case) is looked up via
 * `GoogleAdsApiClient.lookupCampaignBudgetResourceName`, one real API call
 * the first time only: the caller's own `target.save()` after the mutating
 * call persists the resolved value, so every subsequent action against the
 * same target reuses it with no further lookups.
 */
async function resolveBudgetResourceName(
  target: AutomationTargetStateModel,
  targetId: string,
  apiClient: GoogleAdsApiClient,
  customerId: string,
): Promise<string> {
  if (target.campaign_budget_resource_name) {
    return target.campaign_budget_resource_name;
  }
  const campaignResourceName = target.campaign_resource_name ?? targetId;
  const budgetResourceName = await apiClient.lookupCampaignBudgetResourceName(customerId, campaignResourceName);
  if (!budgetResourceName) {
    throw new GoogleAdsBudgetResourceUnknownError(targetId);
  }
  target.campaign_budget_resource_name = budgetResourceName;
  return budgetResourceName;
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
    const budgetResourceName = await resolveBudgetResourceName(target, input.targetId, this.apiClient, this.customerId);
    await this.apiClient.setCampaignBudgetAmount(this.customerId, budgetResourceName, input.afterDailyBudgetUsd);
    target.daily_budget_usd = input.afterDailyBudgetUsd;
    target.updated_at = new Date().toISOString();
    await target.save();
    return { actualDailyBudgetUsd: input.afterDailyBudgetUsd };
  }

  async rollbackBudgetChange(input: AutomationBudgetChangeExecutionInput): Promise<AutomationBudgetChangeExecutionResult> {
    const target = await loadTarget(input);
    const budgetResourceName = await resolveBudgetResourceName(target, input.targetId, this.apiClient, this.customerId);
    await this.apiClient.setCampaignBudgetAmount(this.customerId, budgetResourceName, input.beforeDailyBudgetUsd);
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
