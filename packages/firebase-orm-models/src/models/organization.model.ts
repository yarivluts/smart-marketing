import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/** Top of the tenancy hierarchy. Owns projects and the shared resource library. */
@Model({
  reference_path: 'organizations',
  path_id: 'organization_id',
})
export class OrganizationModel extends BaseModel {
  @Field({ is_required: true, is_text_indexing: true })
  public name!: string;

  @Field({ field_name: 'slug', is_text_indexing: true })
  public slug?: string;

  @Field()
  public billing_email?: string;
}
