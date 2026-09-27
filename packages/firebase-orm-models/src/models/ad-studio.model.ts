import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { AdStudioClipStatus, AdStudioFormat, AdStudioScene } from '@growthos/shared';

export const AD_STUDIO_BRIEF_STATUSES = ['draft', 'planned', 'scripted'] as const;
export type AdStudioBriefStatus = (typeof AD_STUDIO_BRIEF_STATUSES)[number];

/** Which model wrote something, so the UI can say so and a bad output can be traced. */
export interface AdStudioGeneratedBy {
  provider: 'anthropic' | 'gemini';
  model: string;
  generated_at: string;
}

/**
 * One ad being made in the Ad Studio (KAN-229): what the person asked for, and the script - a list
 * of scenes, each one Gemini Omni generation, at most 60 seconds in total. The script lives on the
 * brief because it is always read and saved whole, and stays far below Firestore's document limit
 * (at most 15 short scenes).
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/ad_studio_briefs',
  path_id: 'ad_studio_brief_id',
})
export class AdStudioBriefModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public name!: string;

  @Field({ is_required: true })
  public objective!: string;

  @Field({ is_required: true })
  public product_description!: string;

  @Field({ is_required: false })
  public landing_page_url?: string | null;

  @Field({ is_required: true })
  public video_format!: AdStudioFormat;

  /** The language the ad itself speaks (voiceover, on-screen text): "en", "he", ... */
  @Field({ is_required: true })
  public language!: string;

  @Field({ is_required: true })
  public target_seconds!: number;

  @Field({ is_required: true })
  public status!: AdStudioBriefStatus;

  @Field({ is_required: true })
  public scenes!: AdStudioScene[];

  /** Set when the AI wrote the current script; cleared once a person edits it. */
  @Field({ is_required: false })
  public script_generated_by?: AdStudioGeneratedBy | null;

  @Field({ is_required: true })
  public created_by!: string;

  /** Not `created_at`/`updated_at`: the ORM auto-stamps those names with epoch numbers. */
  @Field({ is_required: true })
  public created_on!: string;

  @Field({ is_required: true })
  public last_changed_on!: string;
}

/** Per-project limits on AI spend in the Ad Studio. One document per project, id `settings`. */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/ad_studio_settings',
  path_id: 'ad_studio_settings_id',
})
export class AdStudioSettingsModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  /** AI text calls (plans, scripts, scene rewrites) allowed per UTC day. */
  @Field({ is_required: true })
  public daily_text_generations!: number;

  /** Seconds of video the project may generate per UTC day. */
  @Field({ is_required: true })
  public daily_video_seconds!: number;

  @Field({ is_required: true })
  public changed_by!: string;

  @Field({ is_required: true })
  public last_changed_on!: string;
}

export const AD_STUDIO_USAGE_KINDS = ['plan', 'script', 'scene_rewrite', 'video_scene', 'video_edit'] as const;
export type AdStudioUsageKind = (typeof AD_STUDIO_USAGE_KINDS)[number];

/**
 * One AI call the Ad Studio made - what it was for, which provider and model, how much it used
 * (1 per text call, seconds for video) and whether it succeeded. Counts toward the daily limits
 * whether or not it succeeded, since a failed provider call can still be billed.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/ad_studio_usage',
  path_id: 'ad_studio_usage_id',
})
export class AdStudioUsageModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public kind!: AdStudioUsageKind;

  @Field({ is_required: true })
  public provider!: string;

  @Field({ is_required: true })
  public model!: string;

  @Field({ is_required: true })
  public units!: number;

  @Field({ is_required: false })
  public brief_id?: string | null;

  @Field({ is_required: true })
  public actor_id!: string;

  @Field({ is_required: true })
  public outcome!: 'succeeded' | 'failed';

  @Field({ is_required: false })
  public failure_reason?: string | null;

  @Field({ is_required: true })
  public occurred_on!: string;

  /** UTC calendar day (YYYY-MM-DD) - the key the daily limits are counted by. */
  @Field({ is_required: true })
  public day!: string;
}

export const AD_STUDIO_CLIP_KINDS = ['render', 'edit'] as const;
export type AdStudioClipKind = (typeof AD_STUDIO_CLIP_KINDS)[number];

/**
 * One generated video for one scene of a brief (KAN-231): a render from the scene's prompt, or a
 * conversational edit of an earlier clip. Versions count up per scene, newest last. The clip is
 * advanced by polling (no job queue): `generating` until Gemini's file is ready and copied into the
 * studio's private bucket, then `ready`, or `failed` with a reason code.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/ad_studio_clips',
  path_id: 'ad_studio_clip_id',
})
export class AdStudioClipModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public brief_id!: string;

  @Field({ is_required: true })
  public scene_id!: string;

  /** The scene (and frame/language) this clip was made from; compared with the current scene to show "out of date". */
  @Field({ is_required: true })
  public scene_fingerprint!: string;

  @Field({ is_required: true })
  public kind!: AdStudioClipKind;

  /** 1, 2, 3 ... per scene. */
  @Field({ is_required: true })
  public version!: number;

  /** The clip an edit started from; null for a render. */
  @Field({ is_required: false })
  public parent_clip_id?: string | null;

  /** The prompt (render) or instruction (edit) sent to the model, kept for tracing a bad result. */
  @Field({ is_required: true })
  public prompt!: string;

  @Field({ is_required: true })
  public model!: string;

  @Field({ is_required: true })
  public aspect_ratio!: string;

  /** Gemini's interaction id - what a later edit chains from. Null until the start call returned. */
  @Field({ is_required: false })
  public interaction_id?: string | null;

  /** Gemini Files API name (`files/...`) of the generated video, once known. */
  @Field({ is_required: false })
  public file_name?: string | null;

  @Field({ is_required: true })
  public status!: AdStudioClipStatus;

  @Field({ is_required: false })
  public failure_reason?: string | null;

  /** Scripted length for a render, the parent's length for an edit. */
  @Field({ is_required: true })
  public duration_seconds!: number;

  /** Object path in the studio bucket once the clip is ready. */
  @Field({ is_required: false })
  public gcs_path?: string | null;

  @Field({ is_required: true })
  public requested_by!: string;

  @Field({ is_required: true })
  public requested_on!: string;

  @Field({ is_required: false })
  public completed_on?: string | null;

  /** A short lease so concurrent status polls do not advance the same clip twice. */
  @Field({ is_required: false })
  public lease_token?: string | null;

  @Field({ is_required: false })
  public lease_until?: string | null;
}

export const AD_STUDIO_VIDEO_STATUSES = ['assembling', 'ready', 'failed'] as const;
export type AdStudioVideoStatus = (typeof AD_STUDIO_VIDEO_STATUSES)[number];

/** One assembled ad: the chosen clip of every scene joined in script order, at most 60 seconds (KAN-231). */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/ad_studio_videos',
  path_id: 'ad_studio_video_id',
})
export class AdStudioVideoModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public brief_id!: string;

  /** The clips joined, in script order. */
  @Field({ is_required: true })
  public clip_ids!: string[];

  @Field({ is_required: true })
  public scene_ids!: string[];

  @Field({ is_required: true })
  public aspect_ratio!: string;

  @Field({ is_required: true })
  public status!: AdStudioVideoStatus;

  @Field({ is_required: false })
  public failure_reason?: string | null;

  /** Measured from the assembled file when available, else the scripted total. */
  @Field({ is_required: true })
  public duration_seconds!: number;

  @Field({ is_required: false })
  public gcs_path?: string | null;

  @Field({ is_required: true })
  public requested_by!: string;

  @Field({ is_required: true })
  public requested_on!: string;

  @Field({ is_required: false })
  public assembled_on?: string | null;
}
