import { AutomationTargetStateModel } from '../../models/automation-target-state.model';
import { AutomationTargetNotFoundError } from '../../services/automation-errors';
import {
  validateCampaignDraft,
  type AutomationActionExecutor,
  type AutomationAdEditExecutionInput,
  type AutomationAdEditExecutionResult,
  type AutomationAdEditRollbackInput,
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

/** An `ad_edit` action's `previousAdResourceName` doesn't match any of the target's own `ad_resource_names` (KAN-72 follow-up) — the caller can never point an edit at an ad outside this target's own campaign, mirroring `AutomationTargetNotFoundError`'s "not this caller's resource" posture one level down. */
export class GoogleAdsAdResourceUnknownError extends Error {
  constructor(adResourceName: string) {
    super(`Ad resource "${adResourceName}" is not one of this automation target's own ads (created by a campaign_draft_create action).`);
    this.name = 'GoogleAdsAdResourceUnknownError';
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
    target.ad_resource_names = result.adResourceNames;
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

  /**
   * Resolves which of a target's own ad groups a `previousAdResourceName`
   * belongs to, via its index in the target's parallel
   * `ad_resource_names`/`ad_group_resource_names` arrays (the same
   * "same index = same ad group" convention `createCampaignDraft` itself
   * establishes, one RSA per ad group). Throws
   * {@link GoogleAdsAdResourceUnknownError} if it isn't one of this target's
   * own ads.
   */
  private resolveAdGroupForAd(target: AutomationTargetStateModel, adResourceName: string): string {
    const adIndex = target.ad_resource_names?.indexOf(adResourceName) ?? -1;
    if (adIndex === -1) {
      throw new GoogleAdsAdResourceUnknownError(adResourceName);
    }
    const adGroupResourceName = target.ad_group_resource_names?.[adIndex];
    if (!adGroupResourceName) {
      throw new GoogleAdsAdResourceUnknownError(adResourceName);
    }
    return adGroupResourceName;
  }

  /**
   * Replaces an ad group's Responsive Search Ad with a new one carrying the
   * caller's revised headlines/descriptions/final URL (KAN-72 follow-up,
   * "post-creation ad edits"). Google Ads' `Ad` resource is immutable once
   * created — there is no partial-update mutate for an RSA's own creative
   * text — so this creates a brand-new `ENABLED` ad in the same ad group and
   * pauses the superseded one, rather than editing anything in place; the new
   * ad's own resource name replaces the old one at the same index in
   * `target.ad_resource_names` (so a second edit of the same ad group targets
   * the *new* ad, and `rollbackAdEdit` knows exactly which ad to remove).
   */
  async executeAdEdit(input: AutomationAdEditExecutionInput): Promise<AutomationAdEditExecutionResult> {
    const target = await loadTarget(input);
    const adIndex = target.ad_resource_names?.indexOf(input.previousAdResourceName) ?? -1;
    const adGroupResourceName = this.resolveAdGroupForAd(target, input.previousAdResourceName);

    const created = await this.apiClient.createResponsiveSearchAd(this.customerId, adGroupResourceName, input.responsiveSearchAd, 'ENABLED');
    await this.apiClient.setAdGroupAdStatus(this.customerId, input.previousAdResourceName, 'PAUSED');

    const nextAdResourceNames = [...(target.ad_resource_names ?? [])];
    nextAdResourceNames[adIndex] = created.adResourceName;
    target.ad_resource_names = nextAdResourceNames;
    target.updated_at = new Date().toISOString();
    await target.save();

    return { newAdResourceName: created.adResourceName };
  }

  /** Restores the superseded ad to `ENABLED` and removes the replacement ad `executeAdEdit` created, undoing exactly one `ad_edit` action. */
  async rollbackAdEdit(input: AutomationAdEditRollbackInput): Promise<void> {
    const target = await loadTarget(input);
    await this.apiClient.setAdGroupAdStatus(this.customerId, input.newAdResourceName, 'REMOVED');
    await this.apiClient.setAdGroupAdStatus(this.customerId, input.previousAdResourceName, 'ENABLED');

    const adIndex = target.ad_resource_names?.indexOf(input.newAdResourceName) ?? -1;
    if (adIndex !== -1) {
      const nextAdResourceNames = [...(target.ad_resource_names ?? [])];
      nextAdResourceNames[adIndex] = input.previousAdResourceName;
      target.ad_resource_names = nextAdResourceNames;
    }
    target.updated_at = new Date().toISOString();
    await target.save();
  }
}
