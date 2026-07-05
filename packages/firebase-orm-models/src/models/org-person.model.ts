import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * The org's people registry (`dim_team_member` in plan 08 §1.2) — reps,
 * agents, managers, etc. Attached per project so leaderboards/wins can
 * resolve people without re-entering them per project. Deliberately not the
 * same thing as `UserModel`: a person here need not ever sign in to
 * GrowthOS (e.g. a sales rep tracked for attribution only).
 */
@Model({
  reference_path: 'organizations/:organization_id/people',
  path_id: 'org_person_id',
})
export class OrgPersonModel extends BaseModel {
  @Field({ is_required: true, is_text_indexing: true })
  public name!: string;

  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_text_indexing: true })
  public email?: string;

  @Field()
  public title?: string;

  @Field()
  public photo_url?: string;

  @Field({ is_required: true })
  public created_by!: string;
}
