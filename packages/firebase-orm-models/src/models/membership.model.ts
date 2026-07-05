import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { Role } from '@growthos/shared';

/**
 * `invited`: created by `inviteMemberToOrganization`, not yet usable for
 * access (no role binding exists until accepted). `active`: usable, has a
 * matching role binding. `suspended`: reserved for a future "pause access
 * without removing the membership" feature — modeled here so the field
 * exists, but nothing in this codebase writes it yet, and permission checks
 * (`resolveOrgSessionContext`/`can()`) key entirely off role bindings, not
 * this status. Whichever story adds a suspend action must also stop
 * treating a suspended member's bindings as valid, or suspending will have
 * no actual effect. Left unset by pre-KAN-25 callers (e.g.
 * `createOrganizationWithOwner`'s predecessors in KAN-22's tests) — those
 * rows are treated as `active`.
 */
export const MEMBERSHIP_STATUSES = ['invited', 'active', 'suspended'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

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
  public status?: MembershipStatus;

  @Field()
  public invited_by?: string;

  @Field()
  public accepted_at?: string;
}
