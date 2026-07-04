import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/** Non-human principal scoped to a project, used for API-key backed automation. */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/service_accounts',
  path_id: 'service_account_id',
})
export class ServiceAccountModel extends BaseModel {
  @Field({ is_required: true, is_text_indexing: true })
  public name!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field()
  public is_active?: boolean;
}
