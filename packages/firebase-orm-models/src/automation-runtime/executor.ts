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
      // `imageUrl` is deliberately omitted for v1 — real Meta image upload is
      // a separate multipart `/act_{id}/adimages` endpoint against a real
      // asset, out of scope for this story (see the KAN-73 PROGRESS.md entry's
      // own "deferred gaps" note). Every ad this connector creates is a
      // text-only link ad.
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
 * The seam KAN-72 (`GoogleAdsAutomationActionExecutor`) and KAN-73
 * (`MetaAutomationActionExecutor`) both implement for real —
 * `executeBudgetChange` applies a proposed change to the live ad platform,
 * `rollbackBudgetChange` restores the pre-action value;
 * `executeCampaignDraftCreate`/`rollbackCampaignDraftCreate` create (and
 * remove) a brand-new paused campaign; `executeCampaignActivation`/
 * `rollbackCampaignActivation` flip an already-created campaign between
 * paused and enabled. Same "provider-agnostic executor interface" posture as
 * `SourcePluginExecutor` (KAN-47) and `WarehouseQueryExecutor` (KAN-42) — the
 * interface itself never mentions a provider name; `resolveAutomationActionExecutorForTarget`
 * (`services/automation-executor-resolver.service.ts`) is the one place that
 * picks a concrete implementation, based on a target's linked credential's
 * `provider`.
 */
export interface AutomationActionExecutor {
  executeBudgetChange(input: AutomationBudgetChangeExecutionInput): Promise<AutomationBudgetChangeExecutionResult>;
  rollbackBudgetChange(input: AutomationBudgetChangeExecutionInput): Promise<AutomationBudgetChangeExecutionResult>;
  executeCampaignDraftCreate(input: AutomationCampaignDraftCreateExecutionInput): Promise<AutomationCampaignDraftCreateExecutionResult>;
  rollbackCampaignDraftCreate(input: AutomationCampaignDraftRollbackInput): Promise<void>;
  executeCampaignActivation(input: AutomationCampaignActivationExecutionInput): Promise<void>;
  rollbackCampaignActivation(input: AutomationCampaignActivationExecutionInput): Promise<void>;
}
