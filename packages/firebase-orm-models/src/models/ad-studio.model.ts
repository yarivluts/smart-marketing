import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { AdStudioFormat, AdStudioScene } from '@growthos/shared';

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
