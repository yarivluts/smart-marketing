import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { WinRuleFilter } from '@growthos/shared';

/**
 * A project-scoped win rule (KAN-65, E12.2, plan `04 §6`): "event pattern ->
 * win" config — any landed event matching `schema_name` and every one of
 * `filters` (AND) fires a {@link WinEventModel}. Deliberately generic (no
 * fixed `win_type` catalog): the plan's own examples (`first_charge`, "order
 * > X") are both expressible as a schema name plus zero or more filters. A
 * canned catalog of specific win types (reactivation, trial-conversion) is
 * KAN-66's story, layered on top of this engine, not this one's.
 *
 * Simple mutable config, not versioned — the same "current = only" posture
 * `GoalModel`/`BoardModel` already use, unlike `SchemaDefModel`/
 * `MetricDefModel`'s append-only version history (a win rule has no
 * downstream consumers that need to resolve an old version by name).
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/win_rules',
  path_id: 'win_rule_id',
})
export class WinRuleModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true, is_text_indexing: true })
  public name!: string;

  /** Must reference an active `SchemaDefModel.name` of kind `event` in this project — validated in `win-rule.service.ts`, not here. */
  @Field({ is_required: true })
  public schema_name!: string;

  /** AND semantics — see `evaluateWinRuleFilters` (`@growthos/shared`). Empty means "any occurrence of this event is a win". */
  @Field({ is_required: true })
  public filters!: WinRuleFilter[];

  /** An inactive rule is kept (not deleted) but never evaluated against newly landed events. */
  @Field({ is_required: true })
  public active!: boolean;

  @Field({ is_required: true })
  public created_by!: string;

  @Field({ is_required: true })
  public created_at!: string;

  @Field({ is_required: true })
  public updated_by!: string;

  @Field({ is_required: true })
  public updated_at!: string;
}
