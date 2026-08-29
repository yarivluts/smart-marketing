import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { Role } from '@growthos/shared';

/**
 * `invited`: created by `inviteMemberToOrganization`, not yet usable for
 * access (no role binding exists until accepted). `active`: usable, has a
 * matching role binding. `suspended`: written by `suspendOrgMember`
 * (KAN-132) to pause access without removing the membership —
 * `reactivateOrgMember` restores it back to `active`; `resolveOrgSessionContext`
 * excludes a suspended member's role bindings so the pause actually takes
 * effect. Left unset by pre-KAN-25 callers (e.g. `createOrganizationWithOwner`'s
 * predecessors in KAN-22's tests) — those rows are treated as `active`.
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

  /**
   * Set by `inviteMemberToOrganization` (KAN-135) only when `role` is
   * project-scoped (`project_admin`/`editor`/`operator` — see
   * `PROJECT_INVITABLE_ROLES` in `@growthos/shared`); the target project's
   * id, always a project under this same `organization_id`. Unset for an
   * org-scoped role (`org_admin`/`viewer`). This is the *intended* scope of
   * the grant, recorded on the membership itself because a pending invite
   * has no role binding yet to read it back from — `acceptInvite` reads it
   * to decide whether the `RoleBindingModel` it mints is `scope_level:
   * 'project'` (`scope_id: project_id`) or `scope_level: 'org'` (`scope_id:
   * organization_id`); `reactivateOrgMember` reads it the same way to
   * restore a suspended member's binding at its original scope rather than
   * always minting a fresh org-scope one.
   */
  @Field()
  public project_id?: string;
}
