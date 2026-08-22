import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { SegmentFilterCondition, SegmentStatus } from '@growthos/shared';

/**
 * A project-scoped saved segment (KAN-76, E22.2): a named, ANDed set of
 * filter conditions over one registered entity schema. Stores only the
 * segment's own definition — no materialized member list exists yet (see
 * `@growthos/shared`'s `segment-filter.ts` doc comment), the same "config in
 * Firestore, execution deferred" split `MetricDefModel`/`GoalModel` already
 * establish; `countSegmentMembers` (`segment.service.ts`) computes the live
 * count on demand instead. KAN-81 (E14.x, Gap 5) turns a segment into an
 * actionable worklist on top of that same definition — an assignable
 * `owner_person_id` and a human-ticked `status` — without changing what a
 * segment itself means.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/segments',
  path_id: 'segment_id',
  /**
   * `@arbel/firebase-orm`'s default (`auto_time` unset -> `true`) makes
   * every `save()` unconditionally overwrite `updated_at` with its own
   * `Date.getTime()` epoch-ms number (`BaseModel.initAutoTime()`), silently
   * discarding the ISO-string convention every service in this codebase
   * assigns and every view/UI reads back — a real, previously-undetected
   * bug this story's own `updateSegmentWorklist` surfaced (a worklist's
   * "who touched this last" timestamp only means something if it's
   * trustworthy). Disabling it here is scoped to `SegmentModel` alone —
   * fixing the same latent issue for every other model in this codebase is
   * a separate, larger cleanup, not part of this story.
   */
  auto_time: false,
})
export class SegmentModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true, is_text_indexing: true })
  public name!: string;

  /** Must reference an active `entity`-kind `SchemaDefModel.name` in this project — validated in `segment.service.ts`, not here (this model has no Firestore access of its own). */
  @Field({ is_required: true })
  public schema_name!: string;

  /** ANDed together — every condition must match for an entity to belong to the segment (once a query executor exists to evaluate that). */
  @Field({ is_required: true })
  public filters!: SegmentFilterCondition[];

  @Field({ is_required: true })
  public created_by!: string;

  @Field({ is_required: true })
  public created_at!: string;

  @Field({ is_required: true })
  public status!: SegmentStatus;

  /**
   * References `OrgPersonModel.id`; `null` until a human assigns one
   * (KAN-81, Gap 5: "owner assignment") — unlike `GoalModel.owner_person_id`,
   * not required at creation. Always assigned explicitly, never left
   * `undefined` — same reasoning `GoalModel.target_value`'s doc comment
   * gives: an `undefined` write here would silently leave a
   * *previously stored* owner untouched instead of clearing it.
   */
  @Field({ is_required: false })
  public owner_person_id!: string | null;

  @Field({ is_required: true })
  public updated_by!: string;

  @Field({ is_required: true })
  public updated_at!: string;
}
