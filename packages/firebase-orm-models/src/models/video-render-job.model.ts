import { BaseModel, Field, Model } from '@arbel/firebase-orm';

export type VideoRenderJobStatus =
  | 'queued'
  | 'stitching_scenes'
  | 'rendering_motion'
  | 'audio_ducking'
  | 'encoding_mp4'
  | 'uploading'
  | 'completed'
  | 'failed';

/**
 * Cloud video stitching and container assembly job record (KAN-313 / Stitch bb113783).
 * Stored at organizations/:organization_id/projects/:project_id/video_render_jobs/:video_render_job_id.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/video_render_jobs',
  path_id: 'video_render_job_id',
})
export class VideoRenderJobModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public storyboard_id!: string;

  @Field({ is_required: true })
  public title!: string;

  @Field({ is_required: true })
  public rendition_format!: string;

  @Field({ is_required: true })
  public aspect_ratio!: string;

  @Field({ is_required: true })
  public resolution!: string;

  @Field({ is_required: true })
  public duration!: string;

  @Field({ is_required: true })
  public duration_sec!: number;

  @Field({ is_required: true })
  public file_size_formatted!: string;

  @Field({ is_required: true })
  public file_size_bytes!: number;

  @Field({ is_required: true })
  public codec!: string;

  @Field({ is_required: true })
  public container!: string;

  @Field({ is_required: true })
  public status!: VideoRenderJobStatus;

  @Field({ is_required: true })
  public progress_pct!: number;

  @Field({ is_required: true })
  public download_url!: string;

  @Field({ is_required: true })
  public cdn_url!: string;

  @Field({ is_required: false })
  public ad_network_synced_meta?: boolean;

  @Field({ is_required: false })
  public ad_network_synced_google?: boolean;

  @Field({ is_required: false })
  public ad_network_synced_tiktok?: boolean;

  @Field({ is_required: false })
  public error_message?: string;

  @Field({ is_required: true })
  public created_at!: string;

  @Field({ is_required: false })
  public completed_at?: string;
}
