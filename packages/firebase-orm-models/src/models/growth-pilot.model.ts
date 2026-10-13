import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { GrowthSiteAnalysis, GrowthTargetDraft, GrowthTargetKind } from '@growthos/shared';

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

  @Field({ is_required: true })
  public created_on!: string;

  @Field({ is_required: true })
  public updated_on!: string;
}

/** What a proposal asks the person to decide. Later stories add creatives, landing pages, audiences and publishing. */
export const GROWTH_PROPOSAL_KINDS = ['target'] as const;
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

  /** The target as proposed (kind `target`). */
  @Field({ is_required: false })
  public draft?: GrowthTargetDraft | null;

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
