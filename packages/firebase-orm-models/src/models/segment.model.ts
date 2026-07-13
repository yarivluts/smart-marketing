import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { SegmentFilterCondition } from '@growthos/shared';

/**
 * A project-scoped saved segment (KAN-76, E22.2): a named, ANDed set of
 * filter conditions over one registered entity schema. Stores only the
 * segment's own definition — no live query executor or materialized member
 * list exists yet (see `@growthos/shared`'s `segment-filter.ts` doc comment
 * for why that fuller "work list" feature is deliberately out of scope
 * here), the same "config in Firestore, execution deferred" split
 * `MetricDefModel`/`GoalModel` already establish.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/segments',
  path_id: 'segment_id',
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
}
