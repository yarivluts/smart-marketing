import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { GoalDirection, GoalRhythm } from '@growthos/shared';

/**
 * A project-scoped goal (KAN-64, E12.1, plan `04 §6`): pins any registered
 * metric to a target (or range) and a deadline, with an owner and a calendar
 * rhythm (even vs. work-week/weekend) that shapes how "expected pace" is
 * computed. Real progress/pace/projection is computed on demand from the
 * warehouse by `goal.service.ts`'s `queryGoalProgress` (see
 * `@growthos/shared`'s `calculateGoalProgress`) — this model stores only the
 * goal's own config, the same "config in Firestore, data from the
 * warehouse" split `BoardModel`/`MetricDefModel` already follow.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/goals',
  path_id: 'goal_id',
})
export class GoalModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true, is_text_indexing: true })
  public name!: string;

  /** Must reference an active `MetricDefModel.name` in this project — validated in `goal.service.ts`, not here (this model has no Firestore access of its own). */
  @Field({ is_required: true })
  public metric_name!: string;

  @Field({ is_required: true })
  public direction!: GoalDirection;

  /**
   * `null` (not `undefined`) when `direction === 'range'` — always assigned
   * explicitly, never left unset. Mirrors `BoardModel.compare`'s exact
   * convention: `@arbel/firebase-orm`'s `getDocumentData()` drops any
   * `undefined` field from the object it hands to Firestore's
   * `updateDoc()`, which leaves a *previously stored* value untouched
   * rather than clearing it — an explicit `null` is a real value that
   * overwrites it. Deliberately `is_required: false` despite always being
   * assigned: `verifyRequiredFields()` treats `null` the same as "missing"
   * for a *required* field and silently skips the whole `save()` call (the
   * exact bug `BoardModel.compare`'s own doc-comment describes) —
   * `is_required: false` opts this field out of that check regardless of
   * its value.
   */
  @Field({ is_required: false })
  public target_value!: number | null;

  /** Same null-vs-undefined convention as {@link target_value} — `null` unless `direction === 'range'`. */
  @Field({ is_required: false })
  public range_min!: number | null;

  /** Same null-vs-undefined convention as {@link target_value} — `null` unless `direction === 'range'`. */
  @Field({ is_required: false })
  public range_max!: number | null;

  /** Inclusive, `YYYY-MM-DD`. */
  @Field({ is_required: true })
  public start_date!: string;

  /** Inclusive, `YYYY-MM-DD`. */
  @Field({ is_required: true })
  public deadline!: string;

  @Field({ is_required: true })
  public rhythm!: GoalRhythm;

  /** References `OrgPersonModel.id`. */
  @Field({ is_required: true })
  public owner_person_id!: string;

  @Field({ is_required: true })
  public created_by!: string;

  @Field({ is_required: true })
  public created_at!: string;

  @Field({ is_required: true })
  public updated_by!: string;

  @Field({ is_required: true })
  public updated_at!: string;
}
