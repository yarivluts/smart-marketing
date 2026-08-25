import { AutomationTargetStateModel } from '../../models/automation-target-state.model';
import { AutomationTargetNotFoundError } from '../../services/automation-errors';
import {
  validateCampaignDraft,
  type AutomationActionExecutor,
  type AutomationAdCreativeEditExecutionInput,
  type AutomationAdCreativeEditExecutionResult,
  type AutomationAdCreativeEditRollbackInput,
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
  type AutomationMetaAdSetEditExecutionInput,
  type AutomationMetaAdSetEditExecutionResult,
  type AutomationMetaAdSetEditRollbackInput,
  type MetaAdSetStatus,
} from '../../automation-runtime';
import { usdToCents, type MetaAdsApiClient, type MetaObjectStatus, type MetaUpdateAdSetParams } from './api-client';
import { parseImageDataUrlBase64 } from './image-data-url';

/** `AutomationMetaAdSetEditExecutionInput.status`/`AutomationMetaAdSetEditRollbackInput.beforeStatus`'s `enabled`/`paused` <-> Meta's own `ACTIVE`/`PAUSED` object-status vocabulary — the same mapping `executeCampaignActivation`/`rollbackCampaignActivation` apply inline for a whole campaign, pulled out here since `executeMetaAdSetEdit`/`rollbackMetaAdSetEdit` both need it in each direction. */
const AD_SET_STATUS_TO_META: Record<MetaAdSetStatus, MetaObjectStatus> = { enabled: 'ACTIVE', paused: 'PAUSED' };

/** The reverse of {@link AD_SET_STATUS_TO_META} — an ad set this connector created is never `DELETED` (only a whole campaign gets deleted on a `campaign_draft_create` rollback), so any non-`ACTIVE` status reported live is treated as `paused`. */
function metaStatusToAdSetStatus(status: MetaObjectStatus): MetaAdSetStatus {
  return status === 'ACTIVE' ? 'enabled' : 'paused';
}

/**
 * A `keyword_edit` action (KAN-72 follow-up) reached `MetaAutomationActionExecutor`
 * — Meta has no ad-group/keyword-targeting concept the way Google Ads Search
 * does (the closest analog, an ad set, is a targeting spec, not a keyword
 * list — see `MetaCampaignDraftAdSet`'s own doc comment), so this action type
 * can never be supported for a Meta target. `proposeKeywordEditAction`
 * (`automation.service.ts`) stays provider-agnostic and doesn't pre-check
 * this — a `keyword_edit` proposed against a Meta-linked target fails here,
 * at execute time, the same "the executor is the one place that knows what a
 * provider can and can't do" posture `GoogleAdsWrongPlatformCampaignDraftError`
 * establishes for a cross-provider `campaign_draft_create`.
 */
export class MetaKeywordEditNotSupportedError extends Error {
  constructor() {
    super('Meta Ads has no ad-group/keyword concept — a keyword_edit action is not supported for a Meta-linked target.');
    this.name = 'MetaKeywordEditNotSupportedError';
  }
}

/**
 * An `ad_edit` action (KAN-72 follow-up) reached `MetaAutomationActionExecutor`
 * — this action type is defined in terms of Google Ads' own Responsive
 * Search Ad shape (`AdEditResponsiveSearchAdContent`'s headlines/descriptions/
 * final URL), which has no Meta equivalent modeled in this codebase yet (a
 * Meta ad's creative is a single primary text/headline/description, not an
 * RSA asset list — see `MetaCampaignDraftAdSet.ad.creative`'s own doc
 * comment). A real Meta post-creation creative edit is a distinct, still-
 * deferred follow-up (plan `13 §E21.3`'s own "post-creation edits beyond
 * activation" bullet), not this action type reused — same "the executor is
 * the one place that knows what a provider can and can't do" posture
 * {@link MetaKeywordEditNotSupportedError} establishes one action type over.
 */
export class MetaAdEditNotSupportedError extends Error {
  constructor() {
    super('Meta Ads has no Responsive Search Ad concept — an ad_edit action is not supported for a Meta-linked target.');
    this.name = 'MetaAdEditNotSupportedError';
  }
}

/** A `budget_change` action was proposed against a target whose Meta campaign resource is unknown and couldn't be confirmed via a live lookup either (e.g. the target's id/`campaign_resource_name` doesn't correspond to a real campaign on this ad account). */
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

/** A `meta_ad_set_edit` action was proposed/executed against an `adSetResourceName` that isn't one of the target's own ad sets (`AutomationTargetStateModel.meta_ad_set_resource_names`) — defense in depth alongside `proposeMetaAdSetEditAction`'s own check (`automation.service.ts`), the same "both the service and the executor enforce it" posture `MetaAdsWrongPlatformCampaignDraftError` establishes for cross-provider isolation. */
export class MetaAdSetNotOwnedByTargetError extends Error {
  constructor(targetId: string, adSetResourceName: string) {
    super(`Ad set "${adSetResourceName}" is not one of automation target "${targetId}"'s own ad sets (created by a campaign_draft_create action).`);
    this.name = 'MetaAdSetNotOwnedByTargetError';
  }
}

/** An `ad_creative_edit` action was proposed/executed against an `adResourceName` that isn't one of the target's own ads (`AutomationTargetStateModel.meta_ad_resource_names`) — the Meta counterpart to {@link MetaAdSetNotOwnedByTargetError}, same "both the service and the executor enforce it" posture. */
export class MetaAdNotOwnedByTargetError extends Error {
  constructor(targetId: string, adResourceName: string) {
    super(`Ad "${adResourceName}" is not one of automation target "${targetId}"'s own ads (created by a campaign_draft_create action).`);
    this.name = 'MetaAdNotOwnedByTargetError';
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
    const budgetResourceName = await this.resolveCampaignBudgetResourceName(target);
    await this.apiClient.setDailyBudgetCents(budgetResourceName, usdToCents(input.afterDailyBudgetUsd));
    target.daily_budget_usd = input.afterDailyBudgetUsd;
    target.updated_at = new Date().toISOString();
    await target.save();
    return { actualDailyBudgetUsd: input.afterDailyBudgetUsd };
  }

  async rollbackBudgetChange(input: AutomationBudgetChangeExecutionInput): Promise<AutomationBudgetChangeExecutionResult> {
    const target = await loadTarget(input);
    const budgetResourceName = await this.resolveCampaignBudgetResourceName(target);
    await this.apiClient.setDailyBudgetCents(budgetResourceName, usdToCents(input.beforeDailyBudgetUsd));
    target.daily_budget_usd = input.beforeDailyBudgetUsd;
    target.updated_at = new Date().toISOString();
    await target.save();
    return { actualDailyBudgetUsd: input.beforeDailyBudgetUsd };
  }

  /**
   * Returns the target's known budget-resource name (== its
   * `campaign_resource_name`, see this class's own doc comment), or — for a
   * target seeded to represent a pre-existing campaign this plugin never
   * created via `campaign_draft_create` (its id *is* the campaign's own
   * resource name in that case, see `AutomationTargetStateModel`'s own doc
   * comment) — confirms it via a live lookup and caches both resource-name
   * fields on the target (not yet saved; the caller's own subsequent
   * `target.save()` persists it alongside the budget change itself). Throws
   * `MetaAdsBudgetResourceUnknownError` if the lookup itself fails.
   */
  private async resolveCampaignBudgetResourceName(target: AutomationTargetStateModel): Promise<string> {
    if (target.campaign_budget_resource_name) {
      return target.campaign_budget_resource_name;
    }
    const campaignResourceName = target.campaign_resource_name ?? target.id;
    try {
      await this.apiClient.getCampaign(campaignResourceName);
    } catch {
      throw new MetaAdsBudgetResourceUnknownError(target.id);
    }
    target.campaign_resource_name = campaignResourceName;
    target.campaign_budget_resource_name = campaignResourceName;
    return campaignResourceName;
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
    const metaAdSetResourceNames: string[] = [];
    const metaAdResourceNames: string[] = [];
    for (const adSet of draft.adSets) {
      const adSetResult = await this.apiClient.createAdSet(this.adAccountId, {
        campaignId: campaign.campaignId,
        name: adSet.name,
        targeting: adSet.targeting,
      });
      metaAdSetResourceNames.push(adSetResult.adSetId);
      const imageHash = adSet.ad.creative.imageDataUrl
        ? (await this.apiClient.uploadAdImage(this.adAccountId, { base64Bytes: parseImageDataUrlBase64(adSet.ad.creative.imageDataUrl) })).imageHash
        : undefined;
      const creativeResult = await this.apiClient.createAdCreative(this.adAccountId, {
        pageId: this.pageId,
        primaryText: adSet.ad.creative.primaryText,
        headline: adSet.ad.creative.headline,
        ...(adSet.ad.creative.description !== undefined ? { description: adSet.ad.creative.description } : {}),
        linkUrl: adSet.ad.creative.linkUrl,
        ...(imageHash ? { imageHash } : {}),
      });
      const adResult = await this.apiClient.createAd(this.adAccountId, {
        adSetId: adSetResult.adSetId,
        creativeId: creativeResult.creativeId,
        name: adSet.ad.name,
      });
      metaAdResourceNames.push(adResult.adId);
    }

    target.campaign_resource_name = campaign.campaignId;
    target.campaign_budget_resource_name = campaign.campaignId;
    target.campaign_status = 'paused';
    target.daily_budget_usd = draft.dailyBudgetUsd;
    target.meta_ad_set_resource_names = metaAdSetResourceNames;
    target.meta_ad_resource_names = metaAdResourceNames;
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

  async executeKeywordEdit(_input: AutomationKeywordEditExecutionInput): Promise<AutomationKeywordEditExecutionResult> {
    throw new MetaKeywordEditNotSupportedError();
  }

  async rollbackKeywordEdit(_input: AutomationKeywordEditRollbackInput): Promise<void> {
    throw new MetaKeywordEditNotSupportedError();
  }

  async executeAdEdit(_input: AutomationAdEditExecutionInput): Promise<AutomationAdEditExecutionResult> {
    throw new MetaAdEditNotSupportedError();
  }

  async rollbackAdEdit(_input: AutomationAdEditRollbackInput): Promise<void> {
    throw new MetaAdEditNotSupportedError();
  }

  /**
   * Reads the ad set's true pre-edit budget/status live (see
   * `AutomationMetaAdSetEditExecutionInput`'s own doc comment for why —
   * `AutomationTargetStateModel` has no per-ad-set field to source them
   * from), applies only the field(s) this edit actually touches via a single
   * `updateAdSet` call, and returns the real pre-edit values so
   * `executeActionByType` (`automation.service.ts`) can widen `action.before`
   * with them for `rollbackMetaAdSetEdit` to restore later.
   */
  async executeMetaAdSetEdit(input: AutomationMetaAdSetEditExecutionInput): Promise<AutomationMetaAdSetEditExecutionResult> {
    const target = await loadTarget(input);
    if (!target.meta_ad_set_resource_names?.includes(input.adSetResourceName)) {
      throw new MetaAdSetNotOwnedByTargetError(target.id, input.adSetResourceName);
    }

    const current = await this.apiClient.getAdSet(input.adSetResourceName);
    const updateParams: MetaUpdateAdSetParams = {};
    const result: AutomationMetaAdSetEditExecutionResult = {};
    if (input.dailyBudgetUsd !== undefined) {
      updateParams.dailyBudgetCents = usdToCents(input.dailyBudgetUsd);
      result.previousDailyBudgetUsd = current.dailyBudgetCents !== undefined ? current.dailyBudgetCents / 100 : 0;
    }
    if (input.status !== undefined) {
      updateParams.status = AD_SET_STATUS_TO_META[input.status];
      result.previousStatus = metaStatusToAdSetStatus(current.status);
    }

    await this.apiClient.updateAdSet(input.adSetResourceName, updateParams);
    target.updated_at = new Date().toISOString();
    await target.save();
    return result;
  }

  /** Re-applies exactly the pre-edit budget/status `executeMetaAdSetEdit` captured — no ownership re-check needed (the action's own stored `adSetResourceName` was already validated at execute time, same posture `rollbackKeywordEdit` establishes for `keyword_edit`). */
  async rollbackMetaAdSetEdit(input: AutomationMetaAdSetEditRollbackInput): Promise<void> {
    const target = await loadTarget(input);
    const updateParams: MetaUpdateAdSetParams = {};
    if (input.beforeDailyBudgetUsd !== undefined) {
      updateParams.dailyBudgetCents = usdToCents(input.beforeDailyBudgetUsd);
    }
    if (input.beforeStatus !== undefined) {
      updateParams.status = AD_SET_STATUS_TO_META[input.beforeStatus];
    }
    if (Object.keys(updateParams).length > 0) {
      await this.apiClient.updateAdSet(input.adSetResourceName, updateParams);
    }
    target.updated_at = new Date().toISOString();
    await target.save();
  }

  /**
   * Replaces an already-created Meta ad's creative (primary text/headline/
   * description/link/image) — see `AutomationAdCreativeEditExecutionInput`'s
   * own doc comment for why this creates a brand-new `AdCreative` and
   * repoints the *same* ad at it (`this.apiClient.updateAd`), rather than
   * creating a whole new ad the way Google's `executeAdEdit` does. Unlike
   * that method, a retried `executeAdCreativeEdit` (transient failure after
   * `createAdCreative` already succeeded) leaves at most a harmless unused
   * orphaned creative object, never a duplicate *ad* an advertiser could see
   * — Meta creative objects are inert until an ad references them — so no
   * instance-level retry cache is needed here the way
   * `GoogleAdsAutomationActionExecutor.pendingAdEditResourceName` guards its
   * own live-orphaned-ad risk.
   */
  async executeAdCreativeEdit(input: AutomationAdCreativeEditExecutionInput): Promise<AutomationAdCreativeEditExecutionResult> {
    const target = await loadTarget(input);
    if (!target.meta_ad_resource_names?.includes(input.adResourceName)) {
      throw new MetaAdNotOwnedByTargetError(target.id, input.adResourceName);
    }

    const current = await this.apiClient.getAd(input.adResourceName);
    const imageHash = input.creative.imageDataUrl
      ? (await this.apiClient.uploadAdImage(this.adAccountId, { base64Bytes: parseImageDataUrlBase64(input.creative.imageDataUrl) })).imageHash
      : undefined;
    const creativeResult = await this.apiClient.createAdCreative(this.adAccountId, {
      pageId: this.pageId,
      primaryText: input.creative.primaryText,
      headline: input.creative.headline,
      ...(input.creative.description !== undefined ? { description: input.creative.description } : {}),
      linkUrl: input.creative.linkUrl,
      ...(imageHash ? { imageHash } : {}),
    });
    await this.apiClient.updateAd(input.adResourceName, { creativeId: creativeResult.creativeId });

    target.updated_at = new Date().toISOString();
    await target.save();
    return { newCreativeResourceName: creativeResult.creativeId, previousCreativeResourceName: current.creativeId };
  }

  /** Repoints the ad back at its pre-edit creative id `executeAdCreativeEdit` captured — no ownership re-check needed, same posture `rollbackMetaAdSetEdit` establishes for `meta_ad_set_edit`. */
  async rollbackAdCreativeEdit(input: AutomationAdCreativeEditRollbackInput): Promise<void> {
    const target = await loadTarget(input);
    await this.apiClient.updateAd(input.adResourceName, { creativeId: input.previousCreativeResourceName });
    target.updated_at = new Date().toISOString();
    await target.save();
  }
}
