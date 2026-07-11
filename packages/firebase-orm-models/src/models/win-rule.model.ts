import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { WinRuleFilter, WinType } from '@growthos/shared';

/**
 * A project-scoped win rule (KAN-65, E12.2, plan `04 §6`): "event pattern ->
 * win" config — any landed event matching `schema_name` and every one of
 * `filters` (AND) fires a {@link WinEventModel}. The event-pattern engine
 * itself is deliberately generic: the plan's own examples (`first_charge`,
 * "order > X") are both expressible as a schema name plus zero or more
 * filters, with no fixed vocabulary of *why* a match counts as a win. KAN-66
 * (E12.2b, `14` gap 14) layers a `win_type` catalog on top — `reactivation`/
 * `trial_conversion` (alongside the `generic` default every KAN-65 rule
 * keeps) — as a label a future celebration/rendering layer (KAN-67's TV
 * mode) can key off, not a canned rule template: the actual `schema_name`/
 * `filters` that make a rule "a reactivation" stay project-specific.
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

  /** The KAN-66 win catalog tag — defaults to `generic` for a plain event-pattern rule. See this model's own doc comment. */
  @Field({ is_required: true })
  public win_type!: WinType;

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
