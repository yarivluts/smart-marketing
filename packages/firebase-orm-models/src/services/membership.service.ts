import { isInvitableRole, type InvitableRole } from '@growthos/shared';
import { MembershipModel } from '../models/membership.model';
import { RoleBindingModel } from '../models/role-binding.model';
import { recordAuditLogEntry } from './audit-log.service';

/**
 * Every role binding a user holds directly in an org's `role_bindings`
 * subcollection, regardless of scope level (org/project/environment) — the
 * query both {@link removeMembershipCascade} and {@link suspendOrgMember}
 * need before they can act on "everything this membership currently grants".
 */
async function listUserBindingsInOrg(organizationId: string, userId: string): Promise<RoleBindingModel[]> {
  return RoleBindingModel.initPath({ organization_id: organizationId })
    .where('principal_type', '==', 'user')
    .where('principal_id', '==', userId)
    .get();
}

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
  const bindings = await listUserBindingsInOrg(membership.organization_id, membership.user_id);

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
 * Guards against leaving an org with no one able to manage it (no
 * bootstrap/support-override path exists yet). Shared by {@link removeOrgMember}
 * and {@link suspendOrgMember} — losing access is losing access whether the
 * membership doc is deleted or merely suspended, so both must refuse to take
 * the org's last active `org_owner` below one. A no-op for any membership
 * that isn't itself an active `org_owner`, since only that case can shrink
 * the active-owner count.
 */
async function assertNotLastActiveOwner(organizationId: string, membership: MembershipModel): Promise<void> {
  if (membership.role !== 'org_owner' || (membership.status ?? 'active') !== 'active') {
    return;
  }
  const ownerMemberships = await MembershipModel.initPath({ organization_id: organizationId })
    .where('role', '==', 'org_owner')
    .get();
  const activeOwnerCount = ownerMemberships.filter((m) => (m.status ?? 'active') === 'active').length;
  if (activeOwnerCount <= 1) {
    throw new LastOwnerError();
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

  await assertNotLastActiveOwner(organizationId, membership);

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
 *
 * `isInvitableRole` (checked below for both the current and requested role)
 * is the org-scope-only set — `org_admin`/`viewer` — so a project-scoped
 * member (`project_admin`/`editor`/`operator`, KAN-135) always throws
 * {@link RoleNotChangeableError} here, matching the "invite is the only way
 * in, revoke-and-reinvite is the only way to change it" posture that scope
 * still has; this surface only mints org-scope bindings, and silently
 * "changing" a project-scoped member's role through it would either drop
 * their project scope entirely or (worse) widen it to org-wide.
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
    const bindings = await listUserBindingsInOrg(organizationId, membership.user_id);
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

/**
 * Thrown by {@link suspendOrgMember} for a membership that isn't currently
 * `active` — a pending `invited` membership has nothing to suspend (revoke
 * the invite instead, via {@link removeOrgMember}) and an already-`suspended`
 * one has nothing further to do.
 */
export class MembershipNotActiveError extends Error {
  constructor() {
    super('Only an active member can be suspended.');
    this.name = 'MembershipNotActiveError';
  }
}

/** Thrown by {@link reactivateOrgMember} for a membership that isn't currently `suspended`. */
export class MembershipNotSuspendedError extends Error {
  constructor() {
    super('This member is not suspended.');
    this.name = 'MembershipNotSuspendedError';
  }
}

/**
 * Pauses an active member's access without removing their membership —
 * `MembershipModel`'s own doc comment names this exact gap: `status` has
 * carried a `'suspended'` value since KAN-25, but until this change nothing
 * in the codebase ever wrote it, and every permission check keyed off role
 * bindings rather than membership status, so a "suspended" member would have
 * kept full access regardless.
 *
 * Removes every role binding the user holds in this org — the same cascade
 * {@link removeMembershipCascade} performs for a full removal, and the reason
 * this alone is enough to actually cut off access everywhere a role binding
 * is the source of truth (the web app's `resolveOrgSessionContext`, the MCP
 * OAuth `mcp.read` grant check, `apps/api`'s act-authorization path) —
 * without also touching the membership doc, so `membership.role` survives
 * for {@link reactivateOrgMember} to restore verbatim. Same last-owner
 * invariant as {@link removeOrgMember}: suspending an org's last active
 * `org_owner` would leave it just as unmanageable as removing them would.
 */
export async function suspendOrgMember(
  organizationId: string,
  membershipId: string,
  performedByUserId: string,
): Promise<MembershipModel> {
  const membership = await MembershipModel.init(membershipId, { organization_id: organizationId });
  if (!membership) {
    throw new MembershipNotFoundError();
  }
  if ((membership.status ?? 'active') !== 'active') {
    throw new MembershipNotActiveError();
  }

  const [, bindings] = await Promise.all([
    assertNotLastActiveOwner(organizationId, membership),
    listUserBindingsInOrg(organizationId, membership.user_id),
  ]);
  await Promise.all(bindings.map((binding) => binding.remove()));

  membership.status = 'suspended';
  await membership.save();

  try {
    await recordAuditLogEntry({
      organizationId,
      actorType: 'user',
      actorId: performedByUserId,
      action: 'membership.suspended',
      targetType: 'membership',
      targetId: membershipId,
      summary: `Suspended member (role "${membership.role}")`,
      before: { status: 'active' },
      after: { status: 'suspended' },
    });
  } catch {
    // Best-effort — audit logging must never turn a successful suspension into a failure for the caller.
  }

  return membership;
}

/**
 * Restores a suspended member's access: flips `status` back to `active` and
 * mints a fresh role binding for `membership.role`, at the same scope
 * {@link acceptInvite} originally minted it at — `scope_level: 'project'`
 * (`scope_id: membership.project_id`) for a project-scoped role,
 * `scope_level: 'org'` (`scope_id: organizationId`) otherwise, per
 * `MembershipModel.project_id`'s own doc comment (KAN-135). Recreating
 * rather than un-deleting is deliberate: {@link suspendOrgMember} genuinely
 * removes the binding documents (see its own doc comment), so there is
 * nothing left to restore in place; a new binding with the same role and
 * scope has an identical practical effect and keeps this symmetric with how
 * every other binding in this codebase gets minted.
 */
export async function reactivateOrgMember(
  organizationId: string,
  membershipId: string,
  performedByUserId: string,
): Promise<MembershipModel> {
  const membership = await MembershipModel.init(membershipId, { organization_id: organizationId });
  if (!membership) {
    throw new MembershipNotFoundError();
  }
  if (membership.status !== 'suspended') {
    throw new MembershipNotSuspendedError();
  }

  const roleBinding = new RoleBindingModel();
  roleBinding.principal_type = 'user';
  roleBinding.principal_id = membership.user_id;
  roleBinding.role = membership.role;
  roleBinding.scope_level = membership.project_id ? 'project' : 'org';
  roleBinding.scope_id = membership.project_id ?? organizationId;
  roleBinding.setPathParams({ organization_id: organizationId });
  await roleBinding.save();

  membership.status = 'active';
  await membership.save();

  try {
    await recordAuditLogEntry({
      organizationId,
      actorType: 'user',
      actorId: performedByUserId,
      action: 'membership.reactivated',
      targetType: 'membership',
      targetId: membershipId,
      summary: `Reactivated member (role "${membership.role}")`,
      before: { status: 'suspended' },
      after: { status: 'active' },
    });
  } catch {
    // Best-effort — audit logging must never turn a successful reactivation into a failure for the caller.
  }

  return membership;
}
