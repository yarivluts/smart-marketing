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
import { usdToCents, type MetaAdsApiClient } from './api-client';

/** A `budget_change` action was proposed against a target with no known Meta campaign resource — see `AutomationTargetStateModel.campaign_budget_resource_name`'s own doc comment for why this isn't looked up on demand yet. */
export class MetaAdsBudgetResourceUnknownError extends Error {
  constructor(targetId: string) {
    super(
      `Automation target "${targetId}" has no known Meta campaign resource — a budget_change action against a Meta target is only supported for a campaign this plugin itself created via campaign_draft_create.`,
    );
    this.name = 'MetaAdsBudgetResourceUnknownError';
  }
}

/**
 * A `campaign_draft_create` action reached `MetaAutomationActionExecutor`
 * with a `platform: 'google_ads'` draft (KAN-73's mirror of
 * `GoogleAdsWrongPlatformCampaignDraftError`) — should never happen if
 * `resolveAutomationActionExecutorForTarget` resolved the right executor for
 * the target's linked credential, but this is defense in depth, not the only
 * check: cross-provider isolation must hold even if a caller wires the wrong
 * executor to a target directly.
 */
export class MetaAdsWrongPlatformCampaignDraftError extends Error {
  constructor() {
    super('MetaAutomationActionExecutor can only execute a campaign draft with platform: "meta".');
    this.name = 'MetaAdsWrongPlatformCampaignDraftError';
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
 * The real Meta `AutomationActionExecutor` (KAN-73) — the Meta sibling of
 * `GoogleAdsAutomationActionExecutor` (KAN-72). Resolved per-target by
 * `resolveAutomationActionExecutorForTarget` (`services/automation-executor-resolver.service.ts`)
 * whenever a target's linked connection (`ResourceAttachmentModel`) is a
 * `provider: 'meta_ads'` credential; falls back to `SimulatedAdAccountExecutor`
 * for every other target.
 *
 * Meta has no separate "campaign budget" object the way Google Ads does
 * (budget lives on the ad set, or — the approach this connector takes — on
 * the campaign itself under Meta's own Advantage Campaign Budget model).
 * Putting `dailyBudgetUsd` on the campaign keeps `AutomationTargetStateModel`'s
 * existing `campaign_budget_resource_name`/`daily_budget_usd` fields
 * meaningful without a schema change: `campaign_budget_resource_name` simply
 * equals `campaign_resource_name` for a Meta target (both point at the same
 * campaign object), whereas for Google Ads they're two distinct resources.
 * This is a deliberate, documented simplification — same posture
 * `GoogleAdsHttpApiClient`'s own doc comment carries for its "sequential
 * mutate calls, not one atomic batch" tradeoff.
 *
 * `executeCampaignDraftCreate` guards `input.draft.platform === 'meta'`
 * before narrowing — defense in depth so a `platform: 'google_ads'` draft
 * can never reach the Meta API client even if the resolver ever mis-wires an
 * executor (see `MetaAdsWrongPlatformCampaignDraftError`).
 */
export class MetaAutomationActionExecutor implements AutomationActionExecutor {
  constructor(
    private readonly apiClient: MetaAdsApiClient,
    private readonly adAccountId: string,
    /** The Facebook Page every created link ad posts as — see `MetaAdsCredentialSecret.pageId`'s own doc comment. */
    private readonly pageId: string,
  ) {}

  async executeBudgetChange(input: AutomationBudgetChangeExecutionInput): Promise<AutomationBudgetChangeExecutionResult> {
    const target = await loadTarget(input);
    if (!target.campaign_budget_resource_name) {
      throw new MetaAdsBudgetResourceUnknownError(input.targetId);
    }
    await this.apiClient.setDailyBudgetCents(target.campaign_budget_resource_name, usdToCents(input.afterDailyBudgetUsd));
    target.daily_budget_usd = input.afterDailyBudgetUsd;
    target.updated_at = new Date().toISOString();
    await target.save();
    return { actualDailyBudgetUsd: input.afterDailyBudgetUsd };
  }

  async rollbackBudgetChange(input: AutomationBudgetChangeExecutionInput): Promise<AutomationBudgetChangeExecutionResult> {
    const target = await loadTarget(input);
    if (!target.campaign_budget_resource_name) {
      throw new MetaAdsBudgetResourceUnknownError(input.targetId);
    }
    await this.apiClient.setDailyBudgetCents(target.campaign_budget_resource_name, usdToCents(input.beforeDailyBudgetUsd));
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
    if (input.draft.platform !== 'meta') {
      throw new MetaAdsWrongPlatformCampaignDraftError();
    }
    const draft = input.draft;

    const campaign = await this.apiClient.createCampaign(this.adAccountId, {
      name: draft.campaignName,
      objective: draft.objective,
      dailyBudgetCents: usdToCents(draft.dailyBudgetUsd),
    });

    // Sequential per-ad-set creation (ad set -> creative -> ad), not one
    // atomic batch — see this class's own doc comment and `MetaAdsHttpApiClient`'s
    // for why.
    for (const adSet of draft.adSets) {
      const adSetResult = await this.apiClient.createAdSet(this.adAccountId, {
        campaignId: campaign.campaignId,
        name: adSet.name,
        targeting: adSet.targeting,
      });
      const creativeResult = await this.apiClient.createAdCreative(this.adAccountId, {
        pageId: this.pageId,
        primaryText: adSet.ad.creative.primaryText,
        headline: adSet.ad.creative.headline,
        ...(adSet.ad.creative.description !== undefined ? { description: adSet.ad.creative.description } : {}),
        linkUrl: adSet.ad.creative.linkUrl,
      });
      await this.apiClient.createAd(this.adAccountId, {
        adSetId: adSetResult.adSetId,
        creativeId: creativeResult.creativeId,
        name: adSet.ad.name,
      });
    }

    target.campaign_resource_name = campaign.campaignId;
    target.campaign_budget_resource_name = campaign.campaignId;
    target.campaign_status = 'paused';
    target.daily_budget_usd = draft.dailyBudgetUsd;
    target.updated_at = new Date().toISOString();
    await target.save();
    return { campaignResourceName: campaign.campaignId };
  }

  async rollbackCampaignDraftCreate(input: AutomationCampaignDraftRollbackInput): Promise<void> {
    const target = await loadTarget(input);
    await this.apiClient.setObjectStatus(input.campaignResourceName, 'DELETED');
    target.campaign_status = 'removed';
    target.updated_at = new Date().toISOString();
    await target.save();
  }

  async executeCampaignActivation(input: AutomationCampaignActivationExecutionInput): Promise<void> {
    const target = await loadTarget(input);
    await this.apiClient.setObjectStatus(input.campaignResourceName, 'ACTIVE');
    target.campaign_status = 'enabled';
    target.updated_at = new Date().toISOString();
    await target.save();
  }

  async rollbackCampaignActivation(input: AutomationCampaignActivationExecutionInput): Promise<void> {
    const target = await loadTarget(input);
    await this.apiClient.setObjectStatus(input.campaignResourceName, 'PAUSED');
    target.campaign_status = 'paused';
    target.updated_at = new Date().toISOString();
    await target.save();
  }
}
