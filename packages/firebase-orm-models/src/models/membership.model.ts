import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { Role } from '@growthos/shared';

/**
 * Links a global user to an organization with a per-org role (many-to-many).
 * Removing a membership must cascade all of that user's bindings in the org
 * (enforced in the service layer, KAN-22 AC).
 */
@Model({
  reference_path: 'organizations/:organization_id/memberships',
  path_id: 'membership_id',
})
export class MembershipModel extends BaseModel {
  @Field({ is_required: true })
  public user_id!: string;

  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public role!: Role;

  @Field()
  public invited_by?: string;

  @Field()
  public accepted_at?: string;
}
