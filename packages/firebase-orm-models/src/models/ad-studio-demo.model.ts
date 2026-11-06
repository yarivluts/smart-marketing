import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { AdStudioDemoRecordingStatus } from '@growthos/shared';
import type { SecretEnvelope } from '../vault';

/**
 * The trial (demo) account the Ad Studio logs into to record a walkthrough of the customer's product.
 * One document per project, id `demo`. The username and the password are envelope-encrypted with
 * the vault (bound to the organization and project), so neither is readable from the document or a
 * backup of it; only the recorder decrypts them, in memory, for one run. Nothing sent to a browser
 * ever carries the password.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/ad_studio_demo_access',
  path_id: 'ad_studio_demo_access_id',
})
export class AdStudioDemoAccessModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  /** The app's sign-in page, public https. */
  @Field({ is_required: true })
  public login_url!: string;

  @Field({ is_required: true })
  public encrypted_username!: SecretEnvelope;

  @Field({ is_required: true })
  public encrypted_password!: SecretEnvelope;

  /** What to show and what to avoid, in the customer's words. */
  @Field({ is_required: false })
  public notes?: string | null;

  @Field({ is_required: true })
  public changed_by!: string;

  @Field({ is_required: true })
  public last_changed_on!: string;
}

/** One recorded moment of a walkthrough, and whether video ads use it. */
export interface AdStudioDemoSegmentRecord {
  id: string;
  start_seconds: number;
  end_seconds: number;
  title: string;
  description: string;
  selected: boolean;
}

/**
 * One recorded walkthrough of the customer's product: an MP4 in the studio's private bucket, cut
 * into labelled moments. `recording` while the browser runs (inside the request), then `ready` or
 * `failed` with a code. Video ads use the selected moments of the newest ready recording.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/ad_studio_demo_recordings',
  path_id: 'ad_studio_demo_recording_id',
})
export class AdStudioDemoRecordingModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public status!: AdStudioDemoRecordingStatus;

  /** The host the tour ran on (never the full login address or anything typed). */
  @Field({ is_required: false })
  public site?: string | null;

  @Field({ is_required: false })
  public gcs_path?: string | null;

  @Field({ is_required: false })
  public duration_seconds?: number | null;

  @Field({ is_required: true })
  public segments!: AdStudioDemoSegmentRecord[];

  @Field({ is_required: false })
  public failure_code?: string | null;

  @Field({ is_required: true })
  public requested_by!: string;

  @Field({ is_required: true })
  public requested_on!: string;

  @Field({ is_required: false })
  public completed_on?: string | null;
}
