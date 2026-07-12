import { BaseModel, Field, Model } from '@arbel/firebase-orm';

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
}
