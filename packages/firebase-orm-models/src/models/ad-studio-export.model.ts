import { BaseModel, Field, Model } from '@arbel/firebase-orm';

export const AD_STUDIO_EXPORT_DESTINATIONS = ['meta', 'youtube', 'google_ads'] as const;
export type AdStudioExportDestination = (typeof AD_STUDIO_EXPORT_DESTINATIONS)[number];

/** What was exported: an assembled video, or an image ad (rows written before image ads existed have none and are videos). */
export const AD_STUDIO_EXPORT_MEDIA_KINDS = ['video', 'image'] as const;
export type AdStudioExportMediaKind = (typeof AD_STUDIO_EXPORT_MEDIA_KINDS)[number];

export const AD_STUDIO_EXPORT_STATUSES = ['uploading', 'done', 'failed'] as const;
export type AdStudioExportStatus = (typeof AD_STUDIO_EXPORT_STATUSES)[number];

/**
 * One upload of an Ad Studio video to an ad platform (KAN-232): to a Meta ad account's video library
 * or to a YouTube channel. Recorded before the upload starts, so an interrupted upload still shows up
 * (as `uploading` that never finished) instead of disappearing.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/ad_studio_exports',
  path_id: 'ad_studio_export_id',
})
export class AdStudioExportModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public brief_id!: string;

  /** The assembled video that was uploaded (its record id in the studio). */
  @Field({ is_required: false })
  public media_kind?: AdStudioExportMediaKind | null;

  /** The assembled video, for video exports. */
  @Field({ is_required: false })
  public video_id?: string | null;

  /** The image, for image exports. */
  @Field({ is_required: false })
  public image_id?: string | null;

  @Field({ is_required: true })
  public destination!: AdStudioExportDestination;

  /** The resource attachment whose credential was used. */
  @Field({ is_required: true })
  public attachment_id!: string;

  @Field({ is_required: true })
  public title!: string;

  @Field({ is_required: true })
  public description!: string;

  /** YouTube only: private, unlisted or public. */
  @Field({ is_required: false })
  public privacy?: string | null;

  @Field({ is_required: true })
  public status!: AdStudioExportStatus;

  @Field({ is_required: false })
  public external_id?: string | null;

  @Field({ is_required: false })
  public external_url?: string | null;

  @Field({ is_required: false })
  public failure_code?: string | null;

  @Field({ is_required: false })
  public failure_message?: string | null;

  @Field({ is_required: true })
  public requested_by!: string;

  @Field({ is_required: true })
  public requested_on!: string;

  @Field({ is_required: false })
  public completed_on?: string | null;
}
