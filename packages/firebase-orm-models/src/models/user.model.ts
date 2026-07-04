import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * Global user - exists once across the whole platform and can belong to many
 * organizations via Membership (many-to-many). See plan 08 par.1.1.
 */
@Model({
  reference_path: 'users',
  path_id: 'user_id',
})
export class UserModel extends BaseModel {
  @Field({ is_required: true, is_text_indexing: true })
  public email!: string;

  @Field({ is_text_indexing: true })
  public display_name?: string;

  @Field()
  public photo_url?: string;

  @Field({ field_name: 'firebase_uid' })
  public firebaseUid?: string;

  @Field()
  public is_active?: boolean;
}
