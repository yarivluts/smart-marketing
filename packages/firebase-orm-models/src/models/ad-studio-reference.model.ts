import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { AdStudioReferenceSource } from '@growthos/shared';

export const AD_STUDIO_REFERENCE_STATUSES = ['generating', 'ready', 'failed'] as const;
export type AdStudioReferenceStatus = (typeof AD_STUDIO_REFERENCE_STATUSES)[number];

/**
 * One reference image in an ad's library (KAN-243): an uploaded app screenshot or an AI
 * illustration, that scenes attach and hand to the video model with their prompt. The bytes live in
 * the media bucket under the brief; this record says what the image is and shows.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/ad_studio_references',
  path_id: 'ad_studio_reference_id',
})
export class AdStudioReferenceModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public brief_id!: string;

  @Field({ is_required: true })
  public source!: AdStudioReferenceSource;

  /** A short name the person sees in the library and the scene picker. */
  @Field({ is_required: true })
  public label!: string;

  /** What the image shows, in the person's words; it goes into the scene prompt. */
  @Field({ is_required: true })
  public description!: string;

  @Field({ is_required: true })
  public status!: AdStudioReferenceStatus;

  /** What the illustration was asked to show, for illustrations. */
  @Field({ is_required: false })
  public prompt?: string | null;

  /** The model that drew an illustration. */
  @Field({ is_required: false })
  public model?: string | null;

  @Field({ is_required: false })
  public gcs_path?: string | null;

  @Field({ is_required: false })
  public mime_type?: string | null;

  @Field({ is_required: false })
  public byte_size?: number | null;

  @Field({ is_required: false })
  public failure_code?: string | null;

  @Field({ is_required: false })
  public failure_message?: string | null;

  @Field({ is_required: true })
  public created_by!: string;

  @Field({ is_required: true })
  public created_on!: string;

  @Field({ is_required: false })
  public completed_on?: string | null;
}
