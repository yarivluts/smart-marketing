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
