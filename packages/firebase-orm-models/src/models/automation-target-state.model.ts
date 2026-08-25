import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * `paused`/`enabled`/`removed` mirror a real Google Ads campaign's own
 * status vocabulary (KAN-72) — Google Ads has no hard delete, only a
 * `REMOVED` status, so "rolling back a creation" and "deleting a campaign"
 * are the same terminal state.
 */
export const CAMPAIGN_STATUSES = ['paused', 'enabled', 'removed'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/**
 * A buildable-today stand-in for "the live state of one ad-platform object
 * (campaign/ad group/ad) as reported by the platform's own API" — until
 * KAN-72/KAN-73 (Google/Meta Manage-tier plugins) exist to read/write a real
 * ad account, `AutomationActionExecutor` implementations mutate this instead,
 * giving KAN-71's execute -> verify -> rollback pipeline something real to
 * operate on end to end. The document id *is* the caller-supplied
 * `target_id` (e.g. a campaign id) — same "id is the natural key" posture as
 * `IngestDedupKeyModel` — so a target's current state is always a single
 * point lookup, and `ensureAutomationTargetSeeded` can be a plain
 * get-or-create. Scoped at the project (not environment) level, same
 * "environment is a field, not a path segment" convention `ApiKeyModel`
 * already established, so listing every target across a project's
 * environments is a single query rather than a fan-out per environment.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/automation_target_states',
  path_id: 'target_id',
})
export class AutomationTargetStateModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public environment_id!: string;

  /** E.g. `'campaign'` — free-form today since no real connector defines a fixed vocabulary yet. */
  @Field({ is_required: true })
  public target_type!: string;

  @Field({ is_required: true })
  public label!: string;

  @Field({ is_required: true })
  public daily_budget_usd!: number;

  @Field({ is_required: true })
  public seeded_at!: string;

  @Field({ is_required: true })
  public updated_at!: string;

  @Field({ is_required: false })
  public seeded_by_user_id?: string;

  /**
   * The KAN-27 `ResourceAttachmentModel` (a `credential`-kind connection)
   * this target's write actions are gated against, if one was picked at seed
   * time. Omitted entirely for a target with no linked connection — same
   * ungated demo posture every target had before KAN-74, so existing/manual
   * targets keep working unchanged. See `automation.service.ts`'s
   * `resolveWriteTierViolation`.
   */
  @Field()
  public resource_attachment_id?: string;

  /**
   * Set once a `campaign_draft_create` action (KAN-72) has executed against
   * this target — the real ad platform's own resource name/id for the
   * campaign it created (e.g. Google Ads' `customers/{id}/campaigns/{id}`).
   * Absent for a target seeded to represent a pre-existing live campaign
   * (its `target_id` *is* the resource name in that case — see this model's
   * own class doc comment) or one that hasn't had a creation action executed
   * yet.
   */
  @Field()
  public campaign_resource_name?: string;

  /**
   * The ad platform's own budget-resource name backing
   * {@link campaign_resource_name} (Google Ads models a campaign's budget as
   * a separate `CampaignBudget` resource, not a plain field on the campaign
   * itself) — only ever set alongside `campaign_resource_name` by a
   * `campaign_draft_create` execution. A `budget_change` action against a
   * target with no known budget resource name (e.g. one seeded to represent
   * a pre-existing campaign this plugin didn't create) isn't supported yet —
   * see `GoogleAdsAutomationActionExecutor`'s own doc comment.
   */
  @Field()
  public campaign_budget_resource_name?: string;

  /** Set alongside {@link campaign_resource_name} by `campaign_draft_create`/`campaign_activation` executions; a target with no campaign created yet has this unset. */
  @Field()
  public campaign_status?: CampaignStatus;

  /**
   * The real ad platform's own resource name/id for each ad group a
   * `campaign_draft_create` action (KAN-72) created against this target's
   * campaign, in the same order as the draft's own `adGroups` array — set
   * alongside {@link campaign_resource_name}. A `keyword_edit` action (KAN-72
   * follow-up) may only target one of these, never an arbitrary
   * caller-supplied resource name — see `automation.service.ts`'s
   * `proposeKeywordEditAction`. Absent for a Meta-platform target (Meta has
   * no ad-group concept, see `MetaAutomationActionExecutor`'s own doc
   * comment) or one that hasn't had a creation action executed yet.
   */
  @Field()
  public ad_group_resource_names?: string[];

  /**
   * The real ad platform's own resource name/id for each ad group's current
   * Responsive Search Ad, in the same order as {@link ad_group_resource_names}
   * (`ad_resource_names[i]` is the current ad for `ad_group_resource_names[i]`)
   * — set alongside it by `campaign_draft_create`, and updated in place by an
   * `ad_edit` action (KAN-72 follow-up, "post-creation ad edits"): Google Ads
   * models an RSA's headlines/descriptions as immutable once created (no
   * partial update), so "editing" an ad really creates a new one and pauses
   * the old one — see `GoogleAdsAutomationActionExecutor.executeAdEdit`'s own
   * doc comment. Absent for a Meta-platform target (no RSA-equivalent
   * in-place-edit action is modeled for Meta yet) or one that hasn't had a
   * creation action executed yet.
   */
  @Field()
  public ad_resource_names?: string[];

  /**
   * The real Meta ad platform's own resource name/id for each ad set a
   * `campaign_draft_create` action (KAN-73) created against this target's
   * campaign, in the same order as the draft's own `adSets` array — set
   * alongside {@link campaign_resource_name}. A `meta_ad_set_edit` action
   * (KAN-73 follow-up) may only target one of these, never an arbitrary
   * caller-supplied resource name — same "can only ever target one of a
   * target's own [child resources]" invariant {@link ad_group_resource_names}'s
   * own doc comment establishes for `keyword_edit`, see
   * `automation.service.ts`'s `proposeMetaAdSetEditAction`. Absent for a
   * Google Ads-platform target (Google Ads' ad groups live in
   * {@link ad_group_resource_names} instead) or one that hasn't had a
   * creation action executed yet.
   */
  @Field()
  public meta_ad_set_resource_names?: string[];

  /**
   * The real Meta ad platform's own resource name/id for each ad set's
   * current ad, in the same order as {@link meta_ad_set_resource_names}
   * (`meta_ad_resource_names[i]` is the current ad for
   * `meta_ad_set_resource_names[i]`) — set alongside it by
   * `campaign_draft_create`. A `meta_ad_creative_edit` action (KAN-73
   * follow-up, "real Meta post-creation creative edit") may only target one
   * of these, never an arbitrary caller-supplied resource name — same
   * invariant {@link ad_resource_names}'s own doc comment establishes for
   * `ad_edit`, see `automation.service.ts`'s `proposeMetaAdCreativeEditAction`.
   * Unlike `ad_resource_names`, this array is never updated in place by the
   * edit itself — a Meta `Ad`'s own resource name never changes, only which
   * `AdCreative` it points at (see `MetaAutomationActionExecutor.executeMetaAdCreativeEdit`'s
   * own doc comment for why that's Meta's real object-model shape). Absent
   * for a Google Ads-platform target (Google Ads' ads live in
   * {@link ad_resource_names} instead) or one that hasn't had a creation
   * action executed yet.
   */
  @Field()
  public meta_ad_resource_names?: string[];
}
