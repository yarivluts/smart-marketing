import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { AdStudioImageFormat } from '@growthos/shared';

export const AD_STUDIO_IMAGE_STATUSES = ['generating', 'ready', 'failed'] as const;
export type AdStudioImageStatus = (typeof AD_STUDIO_IMAGE_STATUSES)[number];

export const AD_STUDIO_IMAGE_KINDS = ['render', 'edit'] as const;
export type AdStudioImageKind = (typeof AD_STUDIO_IMAGE_KINDS)[number];

/** The AI check of a rendered image: `issues` when it found a major problem (a misspelled headline, gibberish letters, a deformed hand). */
export const AD_STUDIO_IMAGE_QA_STATUSES = ['passed', 'issues', 'skipped', 'error'] as const;
export type AdStudioImageQaStatus = (typeof AD_STUDIO_IMAGE_QA_STATUSES)[number];

export interface AdStudioImageQaIssue {
  severity: 'major' | 'minor';
  /** Set when the issue was found in code rather than by the reviewer; `detail` then holds the text read off the image. */
  code?: 'headline_mismatch';
  detail: string;
}

export interface AdStudioImageQa {
  status: AdStudioImageQaStatus;
  issues: AdStudioImageQaIssue[];
  /** Every word the reviewer read in the picture, as written there; null when nothing was checked. */
  text: string | null;
  /** How many images were rendered to reach this one (re-renders after a failed check count). */
  renders: number;
  model: string | null;
  /** True when the headline was set by the studio in code over a text-free picture (the last resort after failed renders). */
  overlay?: boolean;
}

/**
 * One generated ad image: a concept rendered in one placement, or an edit of an earlier image
 * (`parent_image_id` + `instruction`). Every version is kept, so a person can compare and go back;
 * `selected` marks the version the person chose to use for that concept and placement.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/ad_studio_images',
  path_id: 'ad_studio_image_id',
})
export class AdStudioImageModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public brief_id!: string;

  @Field({ is_required: true })
  public concept_id!: string;

  @Field({ is_required: true })
  public image_format!: AdStudioImageFormat;

  @Field({ is_required: true })
  public kind!: AdStudioImageKind;

  /** 1 for the first render of a concept in a placement; each edit or re-render counts up. */
  @Field({ is_required: true })
  public version!: number;

  @Field({ is_required: false })
  public parent_image_id?: string | null;

  /** The edit instruction, for `edit` images. */
  @Field({ is_required: false })
  public instruction?: string | null;

  /** What the concept and placement were when this image was rendered (see `imageConceptFingerprint`). */
  @Field({ is_required: true })
  public concept_fingerprint!: string;

  /** The exact prompt the image model received. */
  @Field({ is_required: true })
  public prompt!: string;

  @Field({ is_required: true })
  public status!: AdStudioImageStatus;

  @Field({ is_required: true })
  public selected!: boolean;

  @Field({ is_required: true })
  public provider!: string;

  @Field({ is_required: true })
  public model!: string;

  @Field({ is_required: false })
  public gcs_path?: string | null;

  @Field({ is_required: false })
  public mime_type?: string | null;

  @Field({ is_required: false })
  public byte_size?: number | null;

  /** The size the image model was asked for (1K or 2K); absent on images made before it was a setting (1K). */
  @Field({ is_required: false })
  public image_size?: string | null;

  /** The AI check of the finished image; absent on images made before the check existed. */
  @Field({ is_required: false })
  public qa?: AdStudioImageQa | null;

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
