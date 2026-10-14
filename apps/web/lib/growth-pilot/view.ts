import type { GrowthActivityKind, GrowthAdsStatus, GrowthAudienceStatus, GrowthPublishPlan, GrowthPublishStatus, GrowthLandingPageStatus, GrowthLandingStatus, GrowthPilotStatus, GrowthProposalKind, GrowthProposalStatus, GrowthTargetStatus } from '@growthos/firebase-orm-models';
import { isRtlLanguage, type GrowthAudiencePlan, type GrowthLandingContent, type GrowthSiteAnalysis, type GrowthTargetDraft, type GrowthTargetKind } from '@growthos/shared';

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
}

export interface GrowthLandingPageView {
  id: string;
  targetId: string;
  slug: string;
  status: GrowthLandingPageStatus;
  content: GrowthLandingContent;
  dir: 'rtl' | 'ltr';
  ctaUrl: string;
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
  createdOn: string;
}

export interface GrowthActivityView {
  id: string;
  kind: GrowthActivityKind;
  byPilot: boolean;
  subject: string | null;
  count: number | null;
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
    createdOn: row.created_on,
  };
}

export function toGrowthLandingPageView(row: { id: string; target_id: string; slug: string; status: GrowthLandingPageStatus; content: GrowthLandingContent; language: string; cta_url: string }): GrowthLandingPageView {
  return { id: row.id, targetId: row.target_id, slug: row.slug, status: row.status, content: row.content, dir: isRtlLanguage(row.language) ? 'rtl' : 'ltr', ctaUrl: row.cta_url };
}

export function toGrowthActivityView(row: { id: string; kind: GrowthActivityKind; actor: string; subject?: string | null; count?: number | null; created_on: string }): GrowthActivityView {
  return { id: row.id, kind: row.kind, byPilot: row.actor === 'pilot', subject: row.subject ?? null, count: row.count ?? null, on: row.created_on };
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
  if (active.some((target) => target.adsStatus === 'building' || (!target.briefId && target.adsStatus === 'none') || target.landingStatus === 'none' || (target.briefId && target.audienceStatus === 'none') || readyToPublish(target))) return true;
  // A change to ads is redone over several calls; other revisions finish within their own request.
  return data.proposals.some((proposal) => proposal.kind === 'ads' && proposal.status === 'revising');
}

/** Proposals waiting for the person first (oldest first, the order they arrived), then the rest. */
export function waitingProposals(proposals: readonly GrowthProposalView[]): GrowthProposalView[] {
  return proposals.filter((proposal) => proposal.status === 'pending' || proposal.status === 'revising');
}
