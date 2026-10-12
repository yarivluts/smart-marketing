import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * A project's brand kit for the Ad Studio: the brand name as it must be written, the tone of voice,
 * words never to use and the brand colours. Every prompt the studio sends follows it. One document
 * per project, id `brand`.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/ad_studio_brand_kit',
  path_id: 'ad_studio_brand_kit_id',
})
export class AdStudioBrandKitModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public brand_name!: string;

  @Field({ is_required: true })
  public tone_of_voice!: string;

  @Field({ is_required: true })
  public avoid_words!: string[];

  /** #rrggbb, most important first. */
  @Field({ is_required: true })
  public colors!: string[];

  /** The logo in the private media bucket, and its type; absent without a logo. */
  @Field({ is_required: false })
  public logo_path?: string | null;

  @Field({ is_required: false })
  public logo_mime?: string | null;

  @Field({ is_required: true })
  public changed_by!: string;

  @Field({ is_required: true })
  public last_changed_on!: string;
}
