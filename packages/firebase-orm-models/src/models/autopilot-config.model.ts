import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * Persisted guardrail configuration and status for Ad Studio Autopilot (KAN-311, Stitch 09980af8).
 * Stored at organizations/:organization_id/projects/:project_id/autopilot_configs/:autopilot_config_id.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/autopilot_configs',
  path_id: 'autopilot_config_id',
})
export class AutopilotConfigModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public daily_cap_usd!: number;

  @Field({ is_required: true })
  public min_roas_floor!: number;

  @Field({ is_required: true })
  public max_cpa_ceiling!: number;

  @Field({ is_required: true })
  public max_shift_velocity_pct!: number;

  @Field({ is_required: true })
  public kill_switch_engaged!: boolean;

  @Field({ is_required: true })
  public autopilot_active!: boolean;

  @Field({ is_required: true })
  public updated_at!: string;

  @Field({ is_required: false })
  public updated_by_user_id?: string;
}
