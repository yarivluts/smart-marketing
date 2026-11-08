import type { GrowthActivityKind, GrowthAdsStatus, GrowthAudienceStatus, GrowthPublishPlan, GrowthPublishStatus, GrowthLandingPageStatus, GrowthLandingStatus, GrowthPilotStatus, GrowthProposalKind, GrowthProposalStatus, GrowthTargetStatus, GrowthVideoStatus } from '@growthos/firebase-orm-models';
import { isRtlLanguage, metaAdsManagerUrl, type GrowthAudiencePlan, type GrowthChangeArea, type GrowthLandingContent, type GrowthSiteAnalysis, type GrowthTargetDraft, type GrowthTargetKind } from '@growthos/shared';

/** What the Growth Pilot page shows: plain, serializable, no model classes. */
export interface GrowthPilotView {
  id: string;
  siteUrl: string;
  status: GrowthPilotStatus;
  failureCode: string | null;
  analysis: GrowthSiteAnalysis | null;
  pagesRead: { url: string; title: string }[];
  createdOn: string;
}

export interface GrowthTargetView {
  id: string;
  kind: GrowthTargetKind;
  name: string;
  description: string;
  audience: string;
  status: GrowthTargetStatus;
  origin: 'site' | 'request';
  briefId: string | null;
  adsStatus: GrowthAdsStatus;
  adsFailure: string | null;
  landingPageId: string | null;
  landingStatus: GrowthLandingStatus;
  landingFailure: string | null;
  audienceStatus: GrowthAudienceStatus;
  audienceFailure: string | null;
  publishStatus: GrowthPublishStatus;
  publishFailure: string | null;
  videoStatus: GrowthVideoStatus;
  videoFailure: string | null;
  /** How many ads it has on Meta (published or running), including old ones still live while new ones wait. */
  liveAds: number;
  /** What the person asked the pilot to redo after approving it, oldest first. */
  changeRequests: GrowthTargetChangeView[];
  /** The daily budget its ads run with on Meta, in the ad account currency; null before publishing (or for ads published before it was kept). */
  dailyBudget: number | null;
  /** The ad account currency (ISO 4217), when Meta said it. */
  budgetCurrency: string | null;
  /** Opens its campaign in Meta Ads Manager; null until its ads are published. */
  adsManagerUrl: string | null;
  createdOn: string;
  updatedOn: string;
}

export interface GrowthTargetChangeView {
  area: GrowthChangeArea;
  text: string;
  on: string;
  outcome: 'pending' | 'done' | 'failed';
  failureCode: string | null;
}

export interface GrowthLandingPageView {
  id: string;
  targetId: string;
  slug: string;
  status: GrowthLandingPageStatus;
  content: GrowthLandingContent;
  dir: 'rtl' | 'ltr';
  ctaUrl: string;
  publishedOn: string | null;
}

export interface GrowthProposalView {
  id: string;
  kind: GrowthProposalKind;
  briefId: string | null;
  landingPageId: string | null;
  audience: GrowthAudiencePlan | null;
  publish: GrowthPublishPlan | null;
  previewImageIds: string[];
  targetId: string | null;
  status: GrowthProposalStatus;
  draft: GrowthTargetDraft | null;
  /** The person's change requests, oldest first, with how the AI handled each. */
  changes: { text: string; on: string; outcome: 'pending' | 'done' | 'failed'; failureCode: string | null }[];
  /** New words proposed for a page that is already public (kind `landing_page`); the live page keeps its words until approved. */
  landingContent: GrowthLandingContent | null;
  /** An audience for ads already on Meta (kind `audience`): approving it changes the live ad set, so it needs the publish permission. */
  appliesToLive: boolean;
  decidedOn: string | null;
  createdOn: string;
}

export interface GrowthActivityView {
  id: string;
  kind: GrowthActivityKind;
  byPilot: boolean;
  subject: string | null;
  count: number | null;
  /** The target the line is about, when it is about one. */
  targetId: string | null;
  /** One more fact the line words: a currency, a failure code. */
  detail: string | null;
  on: string;
}

export interface GrowthPilotPageData {
  pilot: GrowthPilotView;
  targets: GrowthTargetView[];
  proposals: GrowthProposalView[];
  activity: GrowthActivityView[];
  landingPages: GrowthLandingPageView[];
}

interface PilotRow {
  id: string;
  site_url: string;
  status: GrowthPilotStatus;
  failure_code?: string | null;
  analysis?: GrowthSiteAnalysis | null;
  pages_read?: { url: string; title: string }[] | null;
  created_on: string;
}

export function toGrowthPilotView(row: PilotRow): GrowthPilotView {
  return {
    id: row.id,
    siteUrl: row.site_url,
    status: row.status,
    failureCode: row.failure_code ?? null,
    analysis: row.analysis ?? null,
    pagesRead: row.pages_read ?? [],
    createdOn: row.created_on,
  };
}

export function toGrowthTargetView(row: {
  id: string;
  kind: GrowthTargetKind;
  name: string;
  description: string;
  audience: string;
  status: GrowthTargetStatus;
  origin: 'site' | 'request';
  brief_id?: string | null;
  ads_status?: GrowthAdsStatus | null;
  ads_failure?: string | null;
  landing_page_id?: string | null;
  landing_status?: GrowthLandingStatus | null;
  landing_failure?: string | null;
  audience_status?: GrowthAudienceStatus | null;
  audience_failure?: string | null;
  publish_status?: GrowthPublishStatus | null;
  publish_failure?: string | null;
  video_status?: GrowthVideoStatus | null;
  video_failure?: string | null;
  ad_export_ids?: string[] | null;
  change_requests?: { area: GrowthChangeArea; text: string; on: string; outcome: 'pending' | 'done' | 'failed'; failure_code?: string | null }[] | null;
  daily_budget?: number | null;
  budget_currency?: string | null;
  meta_refs?: { ad_account_id: string; campaign_id: string } | null;
  created_on?: string;
  updated_on?: string;
}): GrowthTargetView {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    audience: row.audience,
    status: row.status,
    origin: row.origin,
    briefId: row.brief_id ?? null,
    adsStatus: row.ads_status ?? 'none',
    adsFailure: row.ads_failure ?? null,
    landingPageId: row.landing_page_id ?? null,
    landingStatus: row.landing_status ?? 'none',
    landingFailure: row.landing_failure ?? null,
    audienceStatus: row.audience_status ?? 'none',
    audienceFailure: row.audience_failure ?? null,
    publishStatus: row.publish_status ?? 'none',
    publishFailure: row.publish_failure ?? null,
    videoStatus: row.video_status ?? 'none',
    videoFailure: row.video_failure ?? null,
    liveAds: row.ad_export_ids?.length ?? 0,
    changeRequests: (row.change_requests ?? []).map((change) => ({ area: change.area, text: change.text, on: change.on, outcome: change.outcome, failureCode: change.failure_code ?? null })),
    dailyBudget: typeof row.daily_budget === 'number' ? row.daily_budget : null,
    budgetCurrency: row.budget_currency ?? null,
    adsManagerUrl: row.meta_refs ? metaAdsManagerUrl({ adAccountId: row.meta_refs.ad_account_id, campaignId: row.meta_refs.campaign_id }) : null,
    createdOn: row.created_on ?? '',
    updatedOn: row.updated_on ?? row.created_on ?? '',
  };
}

export function toGrowthProposalView(row: {
  id: string;
  kind: GrowthProposalKind;
  brief_id?: string | null;
  landing_page_id?: string | null;
  audience?: GrowthAudiencePlan | null;
  publish?: GrowthPublishPlan | null;
  preview_image_ids?: string[] | null;
  target_id?: string | null;
  status: GrowthProposalStatus;
  draft?: GrowthTargetDraft | null;
  change_requests: { text: string; on: string; outcome: 'pending' | 'done' | 'failed'; failure_code?: string | null }[];
  landing_content?: GrowthLandingContent | null;
  applies_to_live?: boolean | null;
  decided_on?: string | null;
  created_on: string;
}): GrowthProposalView {
  return {
    id: row.id,
    kind: row.kind,
    briefId: row.brief_id ?? null,
    landingPageId: row.landing_page_id ?? null,
    audience: row.audience ?? null,
    publish: row.publish ?? null,
    previewImageIds: row.preview_image_ids ?? [],
    targetId: row.target_id ?? null,
    status: row.status,
    draft: row.draft ?? null,
    changes: row.change_requests.map((change) => ({ text: change.text, on: change.on, outcome: change.outcome, failureCode: change.failure_code ?? null })),
    landingContent: row.landing_content ?? null,
    appliesToLive: row.applies_to_live === true,
    decidedOn: row.decided_on ?? null,
    createdOn: row.created_on,
  };
}

export function toGrowthLandingPageView(row: { id: string; target_id: string; slug: string; status: GrowthLandingPageStatus; content: GrowthLandingContent; language: string; cta_url: string; published_on?: string | null }): GrowthLandingPageView {
  return { id: row.id, targetId: row.target_id, slug: row.slug, status: row.status, content: row.content, dir: isRtlLanguage(row.language) ? 'rtl' : 'ltr', ctaUrl: row.cta_url, publishedOn: row.published_on ?? null };
}

export function toGrowthActivityView(row: { id: string; kind: GrowthActivityKind; actor: string; subject?: string | null; count?: number | null; target_id?: string | null; detail?: string | null; created_on: string }): GrowthActivityView {
  return { id: row.id, kind: row.kind, byPilot: row.actor === 'pilot', subject: row.subject ?? null, count: row.count ?? null, targetId: row.target_id ?? null, detail: row.detail ?? null, on: row.created_on };
}

/**
 * Whether the pilot has work the page should keep asking for: ads being made, an approved target
 * without ads yet, or an ads proposal being redone on the person's request.
 */
/** Ads approved and the audience and page decided, but no publish proposal yet: the pilot has one to write. */
function readyToPublish(target: GrowthTargetView): boolean {
  const decided = (status: string) => status !== 'none' && status !== 'ready';
  return target.adsStatus === 'approved' && decided(target.audienceStatus) && decided(target.landingStatus) && target.publishStatus === 'none';
}

export function growthPilotHasPendingWork(data: GrowthPilotPageData): boolean {
  if (data.pilot.status !== 'active') return false;
  const active = data.targets.filter((target) => target.status === 'active');
  if (active.some((target) => target.adsStatus === 'building' || target.videoStatus === 'building' || (!target.briefId && target.adsStatus === 'none') || target.landingStatus === 'none' || (target.briefId && target.audienceStatus === 'none') || readyToPublish(target))) return true;
  // A change to ads is redone over several calls; other revisions finish within their own request.
  return data.proposals.some((proposal) => proposal.kind === 'ads' && proposal.status === 'revising');
}

/** Proposals waiting for the person first (oldest first, the order they arrived), then the rest. */
export function waitingProposals(proposals: readonly GrowthProposalView[]): GrowthProposalView[] {
  return proposals.filter((proposal) => proposal.status === 'pending' || proposal.status === 'revising');
}
