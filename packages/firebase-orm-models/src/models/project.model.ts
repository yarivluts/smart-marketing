import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/** A workspace inside an organization. Data is hard-isolated per project. */
@Model({
  reference_path: 'organizations/:organization_id/projects',
  path_id: 'project_id',
})
export class ProjectModel extends BaseModel {
  @Field({ is_required: true, is_text_indexing: true })
  public name!: string;

  @Field({ is_required: true })
  public organization_id!: string;

  @Field()
  public vertical?: string;
}
