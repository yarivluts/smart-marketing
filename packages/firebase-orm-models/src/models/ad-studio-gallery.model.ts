import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { AdStudioGalleryAssetKind, AdStudioGallerySource } from '@growthos/shared';

/**
 * A reusable image or video clip stored in a project's Ad Studio media gallery: uploaded from the
 * computer or saved from an AI-guided product walkthrough. The binary object lives in the project's
 * private media bucket; this document stores its label, description, MIME type, size and duration.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/ad_studio_gallery_assets',
  path_id: 'ad_studio_gallery_asset_id',
})
export class AdStudioGalleryAssetModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public kind!: AdStudioGalleryAssetKind;

  @Field({ is_required: true })
  public source!: AdStudioGallerySource;

  @Field({ is_required: true })
  public label!: string;

  @Field({ is_required: true })
  public description!: string;

  @Field({ is_required: true })
  public gcs_path!: string;

  @Field({ is_required: true })
  public mime_type!: string;

  @Field({ is_required: true })
  public byte_size!: number;

  @Field({ is_required: false })
  public duration_seconds?: number | null;

  @Field({ is_required: true })
  public created_by!: string;

  @Field({ is_required: true })
  public created_on!: string;
}
