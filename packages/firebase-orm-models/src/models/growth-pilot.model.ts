import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { GrowthAudiencePlan, GrowthLandingContent, GrowthSiteAnalysis, GrowthTargetDraft, GrowthTargetKind } from '@growthos/shared';

/**
 * Growth Pilot: the person gives their website and the AI does the marketing work - reads the site,
 * proposes what to grow (targets), then builds ads, landing pages and audiences for each - while the
 * person stays in the middle: every proposal waits for them to approve, reject or ask for a change.
 */

/** `analyzing`: the site is being read; `active`: proposals and targets are being worked; `paused`: the person stopped it. */
export const GROWTH_PILOT_STATUSES = ['analyzing', 'active', 'paused', 'failed', 'archived'] as const;
export type GrowthPilotStatus = (typeof GROWTH_PILOT_STATUSES)[number];

/** One page the analysis read, for "what we read" and for re-reads. */
export interface GrowthPilotPage {
  url: string;
  title: string;
}

/** One Growth Pilot per website of a project: the site, what was learned from it, and its state. */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/growth_pilots',
  path_id: 'growth_pilot_id',
})
export class GrowthPilotModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public site_url!: string;

  @Field({ is_required: true })
  public status!: GrowthPilotStatus;

  @Field({ is_required: false })
  public analysis?: GrowthSiteAnalysis | null;

  @Field({ is_required: false })
  public pages_read?: GrowthPilotPage[] | null;

  /** Why the site read failed, as a stable code (`site_unreachable`, `quota_exceeded`, `provider_error`...). */
  @Field({ is_required: false })
  public failure_code?: string | null;

  @Field({ is_required: false })
  public generated_by?: { provider: string; model: string; generated_at: string } | null;

  /** A caller holding the lease is reading the site; others wait until it expires. */
  @Field({ is_required: false })
  public lease_until?: string | null;

  @Field({ is_required: false })
  public lease_token?: string | null;

  @Field({ is_required: true })
  public started_by!: string;

  @Field({ is_required: true })
  public created_on!: string;

  @Field({ is_required: true })
  public updated_on!: string;
}

/** `proposed`: waits for the person; `active`: approved and being worked; `rejected`: the person said no. */
export const GROWTH_TARGET_STATUSES = ['proposed', 'active', 'paused', 'rejected'] as const;
export type GrowthTargetStatus = (typeof GROWTH_TARGET_STATUSES)[number];

/**
 * Where a target's ads stand: none yet, being made by the Ad Studio autopilot, ready for the person,
 * approved, rejected, or failed (with a reason).
 */
export const GROWTH_ADS_STATUSES = ['none', 'building', 'ready', 'approved', 'rejected', 'failed'] as const;
export type GrowthAdsStatus = (typeof GROWTH_ADS_STATUSES)[number];

/** Where a target's landing page stands. */
export const GROWTH_LANDING_STATUSES = ['none', 'ready', 'published', 'rejected', 'failed'] as const;
export type GrowthLandingStatus = (typeof GROWTH_LANDING_STATUSES)[number];

/** Where a target's ads audience stands. */
export const GROWTH_AUDIENCE_STATUSES = ['none', 'ready', 'approved', 'rejected', 'failed'] as const;
export type GrowthAudienceStatus = (typeof GROWTH_AUDIENCE_STATUSES)[number];

/** Where a target's ads stand on the ad platform. `needs_meta`: ready to publish once a Meta ad account is connected. */
export const GROWTH_PUBLISH_STATUSES = ['none', 'needs_meta', 'ready', 'published', 'running', 'rejected', 'failed'] as const;
export type GrowthPublishStatus = (typeof GROWTH_PUBLISH_STATUSES)[number];

/** What a publish proposal publishes: the approved images as paused Meta ads, with their link and daily budget. */
export interface GrowthPublishPlan {
  destination: 'meta';
  imageIds: string[];
  dailyBudget: number;
  linkUrl: string;
  campaignName: string;
  countries: string[];
}

/** One thing to grow: a product, a service or an audience. */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/growth_targets',
  path_id: 'growth_target_id',
})
export class GrowthTargetModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public pilot_id!: string;

  @Field({ is_required: true })
  public kind!: GrowthTargetKind;

  @Field({ is_required: true })
  public name!: string;

  @Field({ is_required: true })
  public description!: string;

  @Field({ is_required: true })
  public audience!: string;

  @Field({ is_required: true })
  public status!: GrowthTargetStatus;

  /** `site`: proposed from the site read; `request`: the person asked for it. */
  @Field({ is_required: true })
  public origin!: 'site' | 'request';

  /** The Ad Studio brief built for this target, once there is one. */
  @Field({ is_required: false })
  public brief_id?: string | null;

  /** The Ad Studio autopilot run making (or last made) its ads. */
  @Field({ is_required: false })
  public run_id?: string | null;

  @Field({ is_required: false })
  public ads_status?: GrowthAdsStatus | null;

  @Field({ is_required: false })
  public ads_failure?: string | null;

  /** The landing page written for this target, once there is one. */
  @Field({ is_required: false })
  public landing_page_id?: string | null;

  @Field({ is_required: false })
  public landing_status?: GrowthLandingStatus | null;

  @Field({ is_required: false })
  public landing_failure?: string | null;

  @Field({ is_required: false })
  public audience_status?: GrowthAudienceStatus | null;

  @Field({ is_required: false })
  public audience_failure?: string | null;

  @Field({ is_required: false })
  public publish_status?: GrowthPublishStatus | null;

  @Field({ is_required: false })
  public publish_failure?: string | null;

  /** The Ad Studio export rows of its published ads. */
  @Field({ is_required: false })
  public ad_export_ids?: string[] | null;

  @Field({ is_required: true })
  public created_on!: string;

  @Field({ is_required: true })
  public updated_on!: string;
}

/** What a proposal asks the person to decide. Later stories add creatives, landing pages, audiences and publishing. */
export const GROWTH_PROPOSAL_KINDS = ['target', 'ads', 'landing_page', 'audience', 'publish', 'activate'] as const;
export type GrowthProposalKind = (typeof GROWTH_PROPOSAL_KINDS)[number];

/** `revising`: the person asked for a change and the AI is rewriting it; it comes back `pending`. */
export const GROWTH_PROPOSAL_STATUSES = ['pending', 'revising', 'approved', 'rejected'] as const;
export type GrowthProposalStatus = (typeof GROWTH_PROPOSAL_STATUSES)[number];

export interface GrowthChangeRequest {
  text: string;
  by: string;
  on: string;
  /** How the AI handled it: done, or failed with a code (the proposal is unchanged). */
  outcome: 'pending' | 'done' | 'failed';
  failure_code?: string | null;
}

/** One decision waiting for the person - the human in the middle of everything the pilot does. */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/growth_proposals',
  path_id: 'growth_proposal_id',
})
export class GrowthProposalModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public pilot_id!: string;

  @Field({ is_required: false })
  public target_id?: string | null;

  @Field({ is_required: true })
  public kind!: GrowthProposalKind;

  @Field({ is_required: true })
  public status!: GrowthProposalStatus;

  /** The target as proposed (kind `target`), or the target the ads are for (kind `ads`). */
  @Field({ is_required: false })
  public draft?: GrowthTargetDraft | null;

  /** The Ad Studio brief holding the ads (kind `ads`). */
  @Field({ is_required: false })
  public brief_id?: string | null;

  /** What publishing or turning on would do (kinds `publish`, `activate`). */
  @Field({ is_required: false })
  public publish?: GrowthPublishPlan | null;

  /** The audience to approve (kind `audience`). */
  @Field({ is_required: false })
  public audience?: GrowthAudiencePlan | null;

  /** The landing page to approve (kind `landing_page`). */
  @Field({ is_required: false })
  public landing_page_id?: string | null;

  /** The chosen images to preview on the card (kind `ads`). */
  @Field({ is_required: false })
  public preview_image_ids?: string[] | null;

  @Field({ is_required: true })
  public change_requests!: GrowthChangeRequest[];

  @Field({ is_required: false })
  public decided_by?: string | null;

  @Field({ is_required: false })
  public decided_on?: string | null;

  @Field({ is_required: true })
  public created_on!: string;

  @Field({ is_required: true })
  public updated_on!: string;
}

export const GROWTH_ACTIVITY_KINDS = [
  'pilot_started',
  'site_read',
  'analysis_failed',
  'targets_proposed',
  'target_requested',
  'proposal_approved',
  'proposal_rejected',
  'change_requested',
  'proposal_revised',
  'revision_failed',
  'pilot_paused',
  'pilot_resumed',
  'ads_building',
  'ads_ready',
  'ads_failed',
  'landing_ready',
  'landing_published',
  'landing_failed',
  'audience_ready',
  'audience_failed',
  'ads_published',
  'publish_failed',
  'ads_activated',
] as const;
export type GrowthActivityKind = (typeof GROWTH_ACTIVITY_KINDS)[number];

/** One line of "what the pilot did", newest first on the page. Numbers and names only: the UI words them. */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/growth_activity',
  path_id: 'growth_activity_id',
})
export class GrowthActivityModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public pilot_id!: string;

  @Field({ is_required: true })
  public kind!: GrowthActivityKind;

  /** `pilot` for the AI, otherwise the person's user id. */
  @Field({ is_required: true })
  public actor!: string;

  @Field({ is_required: false })
  public subject?: string | null;

  @Field({ is_required: false })
  public count?: number | null;

  @Field({ is_required: true })
  public created_on!: string;
}

/** `draft`: waiting for the person; `published`: live at its public address; `rejected`: the person said no. */
export const GROWTH_LANDING_PAGE_STATUSES = ['draft', 'published', 'rejected'] as const;
export type GrowthLandingPageStatus = (typeof GROWTH_LANDING_PAGE_STATUSES)[number];

/** A landing page the pilot wrote for a target; served publicly at /lp/<slug> once the person approves it. */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/growth_landing_pages',
  path_id: 'growth_landing_page_id',
})
export class GrowthLandingPageModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public pilot_id!: string;

  @Field({ is_required: true })
  public target_id!: string;

  /** The public address part: random, unguessable, stable for the page's life. */
  @Field({ is_required: true })
  public slug!: string;

  @Field({ is_required: true })
  public status!: GrowthLandingPageStatus;

  @Field({ is_required: true })
  public content!: GrowthLandingContent;

  @Field({ is_required: true })
  public language!: string;

  /** Where its buttons lead (the site, tagged). */
  @Field({ is_required: true })
  public cta_url!: string;

  @Field({ is_required: false })
  public published_on?: string | null;

  @Field({ is_required: true })
  public created_on!: string;

  @Field({ is_required: true })
  public updated_on!: string;
}

/**
 * The public address book: slug -> the page it shows. The public route knows only the slug, and a
 * page lives under its organization and project; this one top-level lookup connects them.
 */
@Model({
  reference_path: 'growth_landing_slugs',
  path_id: 'growth_landing_slug_id',
})
export class GrowthLandingSlugModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public landing_page_id!: string;
}

/**
 * One line per project that has a Growth Pilot, at the top level: the scheduler that keeps every
 * pilot moving without an open tab - and the operators' view of all pilots - read it instead of
 * walking every organization. Mirrors the pilot's status; adds when it last ran and how that went.
 */
@Model({
  reference_path: 'growth_pilot_index',
  path_id: 'growth_pilot_index_id',
})
export class GrowthPilotIndexModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public pilot_id!: string;

  @Field({ is_required: true })
  public site_url!: string;

  @Field({ is_required: true })
  public status!: GrowthPilotStatus;

  /** The person who started it: scheduled work runs, and counts toward limits, on their behalf. */
  @Field({ is_required: true })
  public started_by!: string;

  @Field({ is_required: false })
  public last_run_on?: string | null;

  /** `worked`, `idle`, or a failure code from the last scheduled run. */
  @Field({ is_required: false })
  public last_run_outcome?: string | null;

  @Field({ is_required: true })
  public updated_on!: string;
}
