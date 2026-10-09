import { BaseModel, Field, Model } from '@arbel/firebase-orm';

export type AutopilotActionModelStatus = 'executed' | 'rolled_back';

/**
 * Audit ledger record for autonomous budget rebalances, creative rotations,
 * and emergency pauses executed by Ad Studio Autopilot (KAN-311, Stitch 09980af8).
 * Stored at organizations/:organization_id/projects/:project_id/autopilot_actions/:autopilot_action_id.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/autopilot_actions',
  path_id: 'autopilot_action_id',
})
export class AutopilotActionModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public action_type!: string;

  @Field({ is_required: true })
  public channel!: string;

  @Field({ is_required: false })
  public target_campaign_id?: string;

  @Field({ is_required: true })
  public before_budget_usd!: number;

  @Field({ is_required: true })
  public after_budget_usd!: number;

  @Field({ is_required: true })
  public delta_pct!: number;

  @Field({ is_required: true })
  public reason!: string;

  @Field({ is_required: true })
  public impact!: string;

  @Field({ is_required: true })
  public status!: AutopilotActionModelStatus;

  @Field({ is_required: true })
  public executed_at!: string;

  @Field({ is_required: true })
  public executed_by_user_id!: string;

  @Field({ is_required: false })
  public rolled_back_at?: string;

  @Field({ is_required: false })
  public rolled_back_by_user_id?: string;
}
