import type { CampaignStatus } from '../models/automation-target-state.model';

export interface AutomationBudgetChangeExecutionInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  beforeDailyBudgetUsd: number;
  afterDailyBudgetUsd: number;
}

export interface AutomationBudgetChangeExecutionResult {
  actualDailyBudgetUsd: number;
}

export type CampaignDraftKeywordMatchType = 'EXACT' | 'PHRASE' | 'BROAD';

export interface CampaignDraftKeyword {
  text: string;
  matchType: CampaignDraftKeywordMatchType;
}

/** One Search ad group's worth of a campaign draft — one Responsive Search Ad, its keywords, and its negative keywords. */
export interface CampaignDraftAdGroup {
  name: string;
  keywords: CampaignDraftKeyword[];
  negativeKeywords: CampaignDraftKeyword[];
  responsiveSearchAd: {
    /** 3-15 headlines, each <=30 characters — Google Ads' own RSA limits. */
    headlines: string[];
    /** 2-4 descriptions, each <=90 characters — Google Ads' own RSA limits. */
    descriptions: string[];
    finalUrl: string;
  };
}

/**
 * An AI-drafted (or human-drafted) new Google Search campaign (KAN-72, plan
 * `02 §3`: "the AI drafts a new search campaign from your winning themes;
 * you approve; it goes live") — always created paused (plan's own "created
 * objects default to paused" line). Performance Max campaigns use a
 * structurally different "asset group" model (assets, not ad-group
 * keywords/RSAs) and aren't supported by this shape yet — `advertisingChannelType`
 * only ever validates as `'SEARCH'` today, see `validateCampaignDraft`.
 */
export interface GoogleAdsCampaignDraft {
  platform: 'google_ads';
  campaignName: string;
  advertisingChannelType: 'SEARCH';
  dailyBudgetUsd: number;
  adGroups: CampaignDraftAdGroup[];
}

/**
 * Meta's current Outcome-Driven Ad Experiences objective enum (KAN-73) — a
 * small, sane subset of the real one (Meta also offers
 * `OUTCOME_APP_PROMOTION` and a legacy pre-ODAX vocabulary this connector
 * doesn't support).
 */
export const META_CAMPAIGN_OBJECTIVES = [
  'OUTCOME_TRAFFIC',
  'OUTCOME_LEADS',
  'OUTCOME_SALES',
  'OUTCOME_AWARENESS',
  'OUTCOME_ENGAGEMENT',
] as const;
export type MetaCampaignObjective = (typeof META_CAMPAIGN_OBJECTIVES)[number];

/** One Meta ad set's worth of a campaign draft (KAN-73) — a targeting spec plus a single link ad. */
export interface MetaCampaignDraftAdSet {
  name: string;
  targeting: {
    /** ISO-3166 alpha-2 country codes, at least one. */
    countries: string[];
    /** Meta's own bounds: 13-65. */
    ageMin: number;
    ageMax: number;
    /** Omitted entirely means "all genders" (Meta's own default). */
    genders?: Array<'male' | 'female'>;
  };
  ad: {
    name: string;
    creative: {
      primaryText: string;
      headline: string;
      description?: string;
      /** Must be an http(s) URL. */
      linkUrl: string;
      /**
       * Optional creative image, as a `data:image/(png|jpeg);base64,...` URL
       * (e.g. from a browser `FileReader.readAsDataURL()` read of a file
       * input) — a KAN-73 follow-up closing the "real Meta image upload"
       * deferred note. Meta's `/act_{id}/adimages` endpoint accepts raw image
       * bytes as a plain `bytes` form field (base64-encoded) in a normal POST
       * — no multipart/form-data upload plumbing needed, so this rides the
       * exact same `URLSearchParams` request shape every other
       * `MetaAdsHttpApiClient` call already uses (see `uploadAdImage`).
       * Size-capped (`MAX_IMAGE_DATA_URL_LENGTH` in `meta-campaign-draft.ts`)
       * because this whole draft is persisted verbatim on the proposed
       * action's `after.campaignDraft` — a single Firestore document, capped
       * at 1 MiB.
       */
      imageDataUrl?: string;
    };
  };
}

/**
 * An AI-drafted (or human-drafted) new Meta campaign (KAN-73) — always
 * created paused, mirroring Google's own "created objects default to
 * paused" convention. Meta has no "ad group" concept the way Google Search
 * does; the closest analog is an ad set (targeting spec) containing one or
 * more ads. `dailyBudgetUsd` lives on the campaign (an Advantage Campaign
 * Budget-style simplification), not per ad set — see
 * `MetaAutomationActionExecutor`'s own doc comment for why.
 */
export interface MetaCampaignDraft {
  platform: 'meta';
  campaignName: string;
  objective: MetaCampaignObjective;
  dailyBudgetUsd: number;
  /** At least one ad set. */
  adSets: MetaCampaignDraftAdSet[];
}

/**
 * A discriminated union on `platform` (KAN-73) — `validateCampaignDraft`
 * dispatches on this field, and every `AutomationActionExecutor`
 * implementation narrows on it before touching any platform-specific field
 * (defense in depth: the executor resolver should never hand a Meta draft to
 * the Google executor or vice versa, but each executor re-checks its own
 * platform anyway — see `GoogleAdsAutomationActionExecutor.executeCampaignDraftCreate`
 * and `MetaAutomationActionExecutor.executeCampaignDraftCreate`). Code that
 * only ever reads the shared `campaignName`/`dailyBudgetUsd` fields (the
 * simulated executor, the admin diff view) doesn't need to narrow at all.
 */
export type CampaignDraft = GoogleAdsCampaignDraft | MetaCampaignDraft;

export interface AutomationCampaignDraftCreateExecutionInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  draft: CampaignDraft;
}

export interface AutomationCampaignDraftCreateExecutionResult {
  campaignResourceName: string;
}

export interface AutomationCampaignDraftRollbackInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  campaignResourceName: string;
}

export interface AutomationCampaignActivationExecutionInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  campaignResourceName: string;
}

/**
 * Input for the read seam (`readCampaignState`) — no resource name is passed
 * because the executor reads the target row's own `campaign_resource_name`
 * (falling back to the target id itself for a target seeded to represent a
 * pre-existing live campaign, the same fallback
 * `GoogleAdsAutomationActionExecutor.resolveCampaignBudgetResourceName`
 * already applies for `budget_change`).
 */
export interface AutomationCampaignStateReadInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
}

/**
 * What one live read of a campaign's platform state returned —
 * `campaignStatus` is `null` when the target has no campaign yet;
 * `dailyBudgetUsd` is `null` when the platform reports no campaign-level
 * daily budget (e.g. a Meta campaign using ad-set-level budgets).
 */
export interface AutomationCampaignStateReadResult {
  campaignStatus: CampaignStatus | null;
  dailyBudgetUsd: number | null;
}

/**
 * A `keyword_edit` action (KAN-72 follow-up, plan `13 §E21.2`'s own deferred
 * "post-creation ad/keyword edits" bullet) — adds keywords/negative keywords
 * to an ad group a `campaign_draft_create` action already created (see
 * `AutomationTargetStateModel.ad_group_resource_names`). Only ever adding new
 * keyword-level criteria, never removing/editing an existing one, is this
 * action type's whole scope (Meta has no ad-group/keyword concept at all —
 * see `MetaAutomationActionExecutor`'s own doc comment). Editing an RSA ad's
 * own headlines/descriptions is a separate action type, `ad_edit` (below) —
 * see its own doc comment for why it can't reuse this add-only shape.
 */
export interface AutomationKeywordEditExecutionInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  adGroupResourceName: string;
  addKeywords: CampaignDraftKeyword[];
  addNegativeKeywords: CampaignDraftKeyword[];
}

export interface AutomationKeywordEditExecutionResult {
  addedKeywordResourceNames: string[];
  addedNegativeKeywordResourceNames: string[];
}

export interface AutomationKeywordEditRollbackInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  addedKeywordResourceNames: string[];
  addedNegativeKeywordResourceNames: string[];
}

/** One Responsive Search Ad's editable creative content — the same shape `CampaignDraftAdGroup.responsiveSearchAd` uses, minus the ad-group-only keyword lists. */
export interface AdEditResponsiveSearchAdContent {
  /** 3-15 headlines, each <=30 characters — Google Ads' own RSA limits. */
  headlines: string[];
  /** 2-4 descriptions, each <=90 characters — Google Ads' own RSA limits. */
  descriptions: string[];
  finalUrl: string;
}

/**
 * An `ad_edit` action (KAN-72 follow-up, plan `13 §E21.2`'s own deferred
 * "post-creation ad edits" bullet) — replaces an already-created ad group's
 * Responsive Search Ad with a new one carrying revised headlines/
 * descriptions/final URL. `previousAdResourceName` must be one of
 * `AutomationTargetStateModel.ad_resource_names` — the caller can never point
 * an edit at an arbitrary ad outside this target's own campaign, mirroring
 * `AutomationKeywordEditExecutionInput.adGroupResourceName`'s own
 * "must be one of this target's own ad groups" constraint. Unlike
 * `keyword_edit`, this isn't an add-only shape: Google Ads' `Ad` resource is
 * immutable once created (a real in-place partial update of an RSA's own
 * creative text isn't offered by the API), so the only way to change an ad's
 * copy is to create a new ad carrying the revised content and pause the old
 * one — see `GoogleAdsAutomationActionExecutor.executeAdEdit`'s own doc
 * comment for exactly how.
 */
export interface AutomationAdEditExecutionInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  previousAdResourceName: string;
  responsiveSearchAd: AdEditResponsiveSearchAdContent;
}

export interface AutomationAdEditExecutionResult {
  newAdResourceName: string;
}

export interface AutomationAdEditRollbackInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  previousAdResourceName: string;
  newAdResourceName: string;
}

/** Mirrors `CampaignStatus`'s `paused`/`enabled` vocabulary, scoped to one Meta ad set rather than a whole campaign — see `AutomationMetaAdSetEditExecutionInput`'s own doc comment for why an ad set needs its own status vocabulary distinct from `CampaignStatus`. */
export type MetaAdSetStatus = 'enabled' | 'paused';

/**
 * A `meta_ad_set_edit` action (KAN-73 follow-up, plan `13 §E21.2`'s own
 * deferred "post-creation ad/keyword edits" bullet, this story's Meta
 * counterpart to `keyword_edit`) — edits an already-created Meta ad set's
 * daily budget and/or status (see `AutomationTargetStateModel.meta_ad_set_resource_names`).
 * `dailyBudgetUsd`/`status` are each independently optional — an edit may
 * touch either field alone or both at once; `undefined` means "leave this
 * field alone." Unlike `keyword_edit`'s purely additive shape, this
 * overwrites live state, so `MetaAutomationActionExecutor.executeMetaAdSetEdit`
 * reads the ad set's true pre-edit values from Meta itself before applying
 * the edit and returns them (see `AutomationMetaAdSetEditExecutionResult`) —
 * `AutomationTargetStateModel` has no per-ad-set budget/status field to
 * source them from the way `campaign_budget_resource_name`/`campaign_status`
 * do for `budget_change`/`campaign_activation`. Editing an ad set's
 * targeting spec (countries/age range/genders) or its ad's creative isn't
 * supported yet — out of this follow-up's scope, see its own PROGRESS.md
 * entry's "deferred gaps" note.
 */
export interface AutomationMetaAdSetEditExecutionInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  adSetResourceName: string;
  /** Omit to leave the ad set's daily budget untouched. */
  dailyBudgetUsd?: number;
  /** Omit to leave the ad set's status untouched. */
  status?: MetaAdSetStatus;
}

export interface AutomationMetaAdSetEditExecutionResult {
  /** The ad set's real pre-edit daily budget, present only when this edit touched budget. */
  previousDailyBudgetUsd?: number;
  /** The ad set's real pre-edit status, present only when this edit touched status. */
  previousStatus?: MetaAdSetStatus;
}

export interface AutomationMetaAdSetEditRollbackInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  adSetResourceName: string;
  /** Present only when the original edit touched budget — the real pre-edit value `executeMetaAdSetEdit` read live and `executeActionByType` widened `before` with. */
  beforeDailyBudgetUsd?: number;
  /** Present only when the original edit touched status — same provenance as `beforeDailyBudgetUsd`. */
  beforeStatus?: MetaAdSetStatus;
}

/** The full targeting spec `meta_ad_set_targeting_edit` applies to an ad set — the same shape `MetaCampaignDraftAdSet.targeting` uses. Unlike `meta_ad_set_edit`'s independently-optional budget/status fields, this always replaces the whole spec at once (Meta's own `targeting` field is one atomic JSON object, not independently patchable sub-fields), so there's no per-field "leave untouched" option here. */
export type MetaAdSetTargetingEdit = MetaCampaignDraftAdSet['targeting'];

/**
 * A `meta_ad_set_targeting_edit` action (KAN-73 follow-up, this story's own
 * "ad-set targeting-spec edits (countries/age range/genders)" deferred
 * bullet — the direct sibling of `meta_ad_set_edit`'s budget/status edit, for
 * an ad set's targeting spec instead) — replaces an already-created Meta ad
 * set's whole targeting spec (see `AutomationTargetStateModel.meta_ad_set_resource_names`).
 * Like `meta_ad_set_edit`, this overwrites live state, so
 * `MetaAutomationActionExecutor.executeMetaAdSetTargetingEdit` reads the ad
 * set's true pre-edit targeting from Meta itself before applying the edit and
 * returns it (see `AutomationMetaAdSetTargetingEditExecutionResult`) — same
 * "isn't known until execute time" reasoning `AutomationMetaAdSetEditExecutionResult`
 * establishes for its own budget/status. No Google Ads equivalent is modeled
 * (Google Ads' targeting model — location/demographic criteria on a campaign
 * or ad group — is structurally different from Meta's per-ad-set targeting
 * spec and out of this follow-up's scope).
 */
export interface AutomationMetaAdSetTargetingEditExecutionInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  adSetResourceName: string;
  targeting: MetaAdSetTargetingEdit;
}

export interface AutomationMetaAdSetTargetingEditExecutionResult {
  /** The ad set's real pre-edit targeting spec, read live — `AutomationTargetStateModel` has no per-ad-set targeting field to source it from, same reasoning `AutomationMetaAdSetEditExecutionResult`'s own doc comment carries for budget/status. */
  previousTargeting: MetaAdSetTargetingEdit;
}

export interface AutomationMetaAdSetTargetingEditRollbackInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  adSetResourceName: string;
  /** The ad set's real pre-edit targeting spec `executeMetaAdSetTargetingEdit` read live and `executeActionByType` widened `before` with. */
  previousTargeting: MetaAdSetTargetingEdit;
}

/** One Meta ad's editable creative content — the same shape `MetaCampaignDraftAdSet.ad.creative` uses. */
export interface MetaAdCreativeEditContent {
  primaryText: string;
  headline: string;
  description?: string;
  linkUrl: string;
}

/**
 * A `meta_ad_creative_edit` action (KAN-73 follow-up, plan `13 §E21.3`'s own
 * deferred "real Meta post-creation creative edit" bullet, this story's Meta
 * counterpart to `ad_edit`) — replaces an already-created ad's primary text/
 * headline/description with revised copy (see
 * `AutomationTargetStateModel.meta_ad_resource_names`). Unlike Google Ads'
 * `Ad` resource, a Meta `Ad`'s own `creative` reference *is* mutable in
 * place via a normal field-POST — but the `AdCreative` object it points at
 * is not (Meta doesn't offer a partial update of a live creative's
 * `object_story_spec` text once created), so `MetaAutomationActionExecutor.executeMetaAdCreativeEdit`
 * creates a brand-new `AdCreative` carrying the revised copy and then
 * repoints the existing ad at it — a genuine hybrid of `ad_edit`'s
 * create-a-new-child-object shape and `meta_ad_set_edit`'s edit-the-parent-
 * in-place shape, faithful to Meta's own object model (no new "old ad" to
 * pause, unlike `ad_edit`).
 */
export interface AutomationMetaAdCreativeEditExecutionInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  adResourceName: string;
  creative: MetaAdCreativeEditContent;
}

export interface AutomationMetaAdCreativeEditExecutionResult {
  /** The ad's real pre-edit creative resource name, read live — `AutomationTargetStateModel` has no per-ad creative field to source it from, same "isn't known until execute time" reasoning `AutomationMetaAdSetEditExecutionResult` establishes for its own budget/status. */
  previousCreativeResourceName: string;
  /** The new `AdCreative` Meta created to carry the revised copy. */
  newCreativeResourceName: string;
}

export interface AutomationMetaAdCreativeEditRollbackInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  adResourceName: string;
  /** The real pre-edit creative resource name `executeMetaAdCreativeEdit` read live and `executeActionByType` widened `before` with — `rollbackMetaAdCreativeEdit` repoints the ad back to it. */
  previousCreativeResourceName: string;
  /** The replacement creative `executeMetaAdCreativeEdit` created — kept on the rollback input for the same audit-trail reasoning `AutomationAdEditRollbackInput.newAdResourceName` carries, even though repointing the ad back to `previousCreativeResourceName` alone is enough to undo the edit (the orphaned creative is simply left unlinked, never deleted). */
  newCreativeResourceName: string;
}

/**
 * The seam KAN-72 (`GoogleAdsAutomationActionExecutor`) and KAN-73
 * (`MetaAutomationActionExecutor`) both implement for real —
 * `executeBudgetChange` applies a proposed change to the live ad platform,
 * `rollbackBudgetChange` restores the pre-action value;
 * `executeCampaignDraftCreate`/`rollbackCampaignDraftCreate` create (and
 * remove) a brand-new paused campaign; `executeCampaignActivation`/
 * `rollbackCampaignActivation` flip an already-created campaign between
 * paused and enabled; `executeKeywordEdit`/`rollbackKeywordEdit` add (and
 * remove) keywords/negative keywords on an already-created ad group;
 * `executeAdEdit`/`rollbackAdEdit` replace (and restore) an already-created ad
 * group's Responsive Search Ad; `executeMetaAdSetEdit`/`rollbackMetaAdSetEdit`
 * (KAN-73 follow-up) edit (and restore) an already-created Meta ad set's
 * budget/status; `executeMetaAdSetTargetingEdit`/`rollbackMetaAdSetTargetingEdit`
 * (KAN-73 follow-up) edit (and restore) an already-created Meta ad set's
 * whole targeting spec (countries/age range/genders);
 * `executeMetaAdCreativeEdit`/`rollbackMetaAdCreativeEdit`
 * (KAN-73 follow-up) replace (and restore) an already-created Meta ad's
 * creative copy. Same "provider-agnostic executor interface" posture as
 * `SourcePluginExecutor` (KAN-47) and `WarehouseQueryExecutor` (KAN-42) — the
 * interface itself never mentions a provider name;
 * `resolveAutomationActionExecutorForTarget`
 * (`services/automation-executor-resolver.service.ts`) is the one place that
 * picks a concrete implementation, based on a target's linked credential's
 * `provider`. Every implementation must still implement every method even
 * though `keyword_edit`/`ad_edit`/`meta_ad_set_edit`/`meta_ad_set_targeting_edit`/`meta_ad_creative_edit`
 * are each only ever meaningful for one provider —
 * `MetaAutomationActionExecutor.executeKeywordEdit`/`executeAdEdit` and
 * `GoogleAdsAutomationActionExecutor.executeMetaAdSetEdit`/`executeMetaAdSetTargetingEdit`/`executeMetaAdCreativeEdit`
 * throw a documented "not supported" error instead (see each class's own doc
 * comment).
 */
export interface AutomationActionExecutor {
  executeBudgetChange(input: AutomationBudgetChangeExecutionInput): Promise<AutomationBudgetChangeExecutionResult>;
  rollbackBudgetChange(input: AutomationBudgetChangeExecutionInput): Promise<AutomationBudgetChangeExecutionResult>;
  executeCampaignDraftCreate(input: AutomationCampaignDraftCreateExecutionInput): Promise<AutomationCampaignDraftCreateExecutionResult>;
  rollbackCampaignDraftCreate(input: AutomationCampaignDraftRollbackInput): Promise<void>;
  executeCampaignActivation(input: AutomationCampaignActivationExecutionInput): Promise<void>;
  rollbackCampaignActivation(input: AutomationCampaignActivationExecutionInput): Promise<void>;
  executeKeywordEdit(input: AutomationKeywordEditExecutionInput): Promise<AutomationKeywordEditExecutionResult>;
  rollbackKeywordEdit(input: AutomationKeywordEditRollbackInput): Promise<void>;
  executeAdEdit(input: AutomationAdEditExecutionInput): Promise<AutomationAdEditExecutionResult>;
  rollbackAdEdit(input: AutomationAdEditRollbackInput): Promise<void>;
  executeMetaAdSetEdit(input: AutomationMetaAdSetEditExecutionInput): Promise<AutomationMetaAdSetEditExecutionResult>;
  rollbackMetaAdSetEdit(input: AutomationMetaAdSetEditRollbackInput): Promise<void>;
  executeMetaAdSetTargetingEdit(input: AutomationMetaAdSetTargetingEditExecutionInput): Promise<AutomationMetaAdSetTargetingEditExecutionResult>;
  rollbackMetaAdSetTargetingEdit(input: AutomationMetaAdSetTargetingEditRollbackInput): Promise<void>;
  executeMetaAdCreativeEdit(input: AutomationMetaAdCreativeEditExecutionInput): Promise<AutomationMetaAdCreativeEditExecutionResult>;
  rollbackMetaAdCreativeEdit(input: AutomationMetaAdCreativeEditRollbackInput): Promise<void>;
  /**
   * The read seam (KAN-43 groundwork): reads the target's campaign state as
   * the ad platform itself reports it right now, persists what it read onto
   * the target row (`campaign_status`, `daily_budget_usd` when the platform
   * reports one) along with `last_read_state_at`, and returns it — the one
   * executor method that writes the target row WITHOUT an approved action,
   * legal precisely because it only ever records observed platform state,
   * never changes it. The simulated executor reports the target row itself
   * (it IS the simulated platform), so a refresh there is an honest no-op
   * beyond stamping `last_read_state_at`.
   */
  readCampaignState(input: AutomationCampaignStateReadInput): Promise<AutomationCampaignStateReadResult>;
}
