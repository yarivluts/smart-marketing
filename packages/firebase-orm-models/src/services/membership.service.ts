import { isInvitableRole, type InvitableRole } from '@growthos/shared';
import { MembershipModel } from '../models/membership.model';
import { RoleBindingModel } from '../models/role-binding.model';
import { recordAuditLogEntry } from './audit-log.service';

/**
 * Removes a membership and every role binding it granted within that org, in
 * one call — plan 08 §1.1: "removing the membership cascades removal of all
 * that user's bindings in the org (single revocation point)". Role bindings
 * always hang off a membership regardless of the scope level (org/project/
 * environment) they were granted at, since they all live in the same
 * `organizations/{org}/role_bindings` subcollection.
 *
 * Firestore has no multi-document transaction in this ORM's client-SDK-based
 * API, so this isn't atomic: if a binding delete fails partway through, the
 * membership is deliberately left in place (deleted last) rather than
 * orphaned bindings left behind un-owned. Re-calling with the same
 * membership is safe — the binding query re-reads current state each time,
 * so it only ever removes what's still there.
 */
export async function removeMembershipCascade(membership: MembershipModel): Promise<void> {
  const bindings = await RoleBindingModel.initPath({ organization_id: membership.organization_id })
    .where('principal_type', '==', 'user')
    .where('principal_id', '==', membership.user_id)
    .get();

  await Promise.all(bindings.map((binding) => binding.remove()));
  await membership.remove();
}

export class MembershipNotFoundError extends Error {
  constructor() {
    super('Membership not found.');
    this.name = 'MembershipNotFoundError';
  }
}

export class LastOwnerError extends Error {
  constructor() {
    super('An organization must always have at least one active org_owner.');
    this.name = 'LastOwnerError';
  }
}

/**
 * Thrown by {@link updateMemberRole} when either the membership's current
 * role or the requested new role isn't in {@link INVITABLE_ROLES}
 * (`org_admin`/`viewer`). `org_owner`/`platform_admin` are deliberately
 * unreachable through this surface — same "handed out by invite" boundary
 * `INVITABLE_ROLES`'s own doc comment draws, and the org-owner side of it
 * also protects the last-owner invariant `removeOrgMember` enforces (this
 * surface can never create or remove an org_owner, so it can never leave an
 * org ownerless).
 */
export class RoleNotChangeableError extends Error {
  constructor() {
    super('Only the org_admin and viewer roles can be changed via this surface.');
    this.name = 'RoleNotChangeableError';
  }
}

/**
 * The admin-surface counterpart to `inviteMemberToOrganization`/`acceptInvite`
 * — revokes a pending invite or removes an active member (same operation
 * either way: {@link removeMembershipCascade} handles both since it just
 * deletes whatever bindings and membership doc exist). Refuses to remove the
 * organization's last active `org_owner`, since that would leave the org with
 * no one able to manage it (no bootstrap/support-override path exists yet).
 */
export async function removeOrgMember(
  organizationId: string,
  membershipId: string,
  performedByUserId: string,
): Promise<void> {
  const membership = await MembershipModel.init(membershipId, { organization_id: organizationId });
  if (!membership) {
    throw new MembershipNotFoundError();
  }

  if (membership.role === 'org_owner' && (membership.status ?? 'active') === 'active') {
    const ownerMemberships = await MembershipModel.initPath({ organization_id: organizationId })
      .where('role', '==', 'org_owner')
      .get();
    const activeOwnerCount = ownerMemberships.filter((m) => (m.status ?? 'active') === 'active').length;
    if (activeOwnerCount <= 1) {
      throw new LastOwnerError();
    }
  }

  const removedUserId = membership.user_id;
  const removedRole = membership.role;
  const wasActive = (membership.status ?? 'active') === 'active';
  await removeMembershipCascade(membership);

  try {
    await recordAuditLogEntry({
      organizationId,
      actorType: 'user',
      actorId: performedByUserId,
      action: wasActive ? 'membership.removed' : 'membership.invite_revoked',
      targetType: 'membership',
      targetId: membershipId,
      summary: wasActive
        ? `Removed member (role "${removedRole}")`
        : `Revoked pending invite (role "${removedRole}")`,
      before: { userId: removedUserId, role: removedRole },
    });
  } catch {
    // Best-effort — audit logging must never turn a successful removal into a failure for the caller.
  }
}

/**
 * The admin "change role" surface that didn't exist before this change (see
 * {@link RoleNotChangeableError}'s doc comment): moves an already-invitable
 * member between `org_admin` and `viewer`. Previously the only way to change
 * a member's role was revoke-and-re-invite, which loses their membership
 * history (`invited_by`/`accepted_at`) and — until they accept the new
 * invite — drops their access entirely.
 *
 * Updates `MembershipModel.role` (the record of what was granted) and, for
 * an already-`active` membership, every matching org-scope role binding for
 * that user (the actual authorization source `can()` reads —
 * `MembershipModel.role` alone doesn't affect permission checks). A pending
 * `invited` membership has no role binding yet (see `acceptInvite`'s own
 * doc comment), so only the membership doc is updated — the invite simply
 * promises the new role once accepted.
 */
export async function updateMemberRole(
  organizationId: string,
  membershipId: string,
  newRole: InvitableRole,
  performedByUserId: string,
): Promise<MembershipModel> {
  const membership = await MembershipModel.init(membershipId, { organization_id: organizationId });
  if (!membership) {
    throw new MembershipNotFoundError();
  }
  if (!isInvitableRole(membership.role) || !isInvitableRole(newRole)) {
    throw new RoleNotChangeableError();
  }

  const previousRole = membership.role;
  membership.role = newRole;
  await membership.save();

  if ((membership.status ?? 'active') === 'active') {
    const bindings = await RoleBindingModel.initPath({ organization_id: organizationId })
      .where('principal_type', '==', 'user')
      .where('principal_id', '==', membership.user_id)
      .get();
    const orgScopeBindings = bindings.filter(
      (binding) => binding.scope_level === 'org' && binding.scope_id === organizationId && binding.role === previousRole,
    );
    await Promise.all(
      orgScopeBindings.map((binding) => {
        binding.role = newRole;
        return binding.save();
      }),
    );
  }

  try {
    await recordAuditLogEntry({
      organizationId,
      actorType: 'user',
      actorId: performedByUserId,
      action: 'membership.role_updated',
      targetType: 'membership',
      targetId: membershipId,
      summary: `Changed member role from "${previousRole}" to "${newRole}"`,
      before: { role: previousRole },
      after: { role: newRole },
    });
  } catch {
    // Best-effort — audit logging must never turn a successful role change into a failure for the caller.
  }

  return membership;
}
