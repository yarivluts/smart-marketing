import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import {
  MrrMovementType,
  TierMovementDirection,
  AccountSegment,
} from '@growthos/shared';

/**
 * Account expansion & MRR movement event model (KAN-314 / Stitch 32432bb4).
 * Stored at organizations/:organization_id/projects/:project_id/customer_expansion_events/:customer_expansion_event_id.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/customer_expansion_events',
  path_id: 'customer_expansion_event_id',
})
export class CustomerExpansionEventModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public customer_id!: string;

  @Field({ is_required: true })
  public account_name!: string;

  @Field({ is_required: true })
  public from_tier!: string;

  @Field({ is_required: true })
  public to_tier!: string;

  @Field({ is_required: true })
  public previous_mrr!: number;

  @Field({ is_required: true })
  public current_mrr!: number;

  @Field({ is_required: true })
  public mrr_delta!: number;

  @Field({ is_required: true })
  public movement_type!: MrrMovementType;

  @Field({ is_required: true })
  public direction!: TierMovementDirection;

  @Field({ is_required: true })
  public segment!: AccountSegment;

  @Field({ is_required: true })
  public velocity_score!: number;

  @Field({ is_required: true })
  public trigger_reason!: string;

  @Field({ is_required: true })
  public recorded_at!: string;
}
