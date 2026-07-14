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
 * An AI-drafted (or human-drafted) new Search campaign (KAN-72, plan
 * `02 §3`: "the AI drafts a new search campaign from your winning themes;
 * you approve; it goes live") — always created paused (plan's own "created
 * objects default to paused" line). Performance Max campaigns use a
 * structurally different "asset group" model (assets, not ad-group
 * keywords/RSAs) and aren't supported by this shape yet — `advertisingChannelType`
 * only ever validates as `'SEARCH'` today, see `validateCampaignDraft`.
 */
export interface CampaignDraft {
  campaignName: string;
  advertisingChannelType: 'SEARCH';
  dailyBudgetUsd: number;
  adGroups: CampaignDraftAdGroup[];
}

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
 * The seam KAN-72/KAN-73 (Google Ads / Meta Manage-tier plugins) implement
 * against for real — `executeBudgetChange` applies a proposed change to the
 * live ad platform, `rollbackBudgetChange` restores the pre-action value;
 * `executeCampaignDraftCreate`/`rollbackCampaignDraftCreate` create (and
 * remove) a brand-new paused campaign; `executeCampaignActivation`/
 * `rollbackCampaignActivation` flip an already-created campaign between
 * paused and enabled. Same "provider-agnostic executor interface" posture as
 * `SourcePluginExecutor` (KAN-47) and `WarehouseQueryExecutor` (KAN-42).
 */
export interface AutomationActionExecutor {
  executeBudgetChange(input: AutomationBudgetChangeExecutionInput): Promise<AutomationBudgetChangeExecutionResult>;
  rollbackBudgetChange(input: AutomationBudgetChangeExecutionInput): Promise<AutomationBudgetChangeExecutionResult>;
  executeCampaignDraftCreate(input: AutomationCampaignDraftCreateExecutionInput): Promise<AutomationCampaignDraftCreateExecutionResult>;
  rollbackCampaignDraftCreate(input: AutomationCampaignDraftRollbackInput): Promise<void>;
  executeCampaignActivation(input: AutomationCampaignActivationExecutionInput): Promise<void>;
  rollbackCampaignActivation(input: AutomationCampaignActivationExecutionInput): Promise<void>;
}
