import { INVITABLE_ROLES, isInvitableRole, type InvitableRole } from '@growthos/shared';
import { MembershipModel } from '../models/membership.model';
import { RoleBindingModel } from '../models/role-binding.model';
import { ensureUserByEmail } from './user.service';

// Re-exported for convenience — `@growthos/shared` is the source of truth
// (it has no Firebase dependency, so client components can import it
// directly without pulling the whole ORM into their bundle).
export { INVITABLE_ROLES, isInvitableRole };
export type { InvitableRole };

export class MembershipAlreadyExistsError extends Error {
  constructor() {
    super('This person already has a membership (active or pending) in this organization.');
    this.name = 'MembershipAlreadyExistsError';
  }
}

export interface InviteMemberParams {
  organizationId: string;
  email: string;
  role: InvitableRole;
  invitedByUserId: string;
}

/**
 * Invites someone to an org by email. Works whether or not they've signed up
 * yet — `ensureUserByEmail` creates a placeholder `UserModel` row if needed,
 * which `ensureUserForFirebaseSession` (in `user.service.ts`) later links to
 * their real Firebase UID the first time they authenticate with a matching
 * email, so `MembershipModel.user_id` never needs to change at acceptance.
 */
export async function inviteMemberToOrganization(params: InviteMemberParams): Promise<MembershipModel> {
  const invitee = await ensureUserByEmail(params.email);

  const existingMemberships = await MembershipModel.initPath({ organization_id: params.organizationId })
    .where('user_id', '==', invitee.id)
    .get();
  if (existingMemberships.length > 0) {
    throw new MembershipAlreadyExistsError();
  }

  const membership = new MembershipModel();
  membership.user_id = invitee.id;
  membership.organization_id = params.organizationId;
  membership.role = params.role;
  membership.status = 'invited';
  membership.invited_by = params.invitedByUserId;
  membership.setPathParams({ organization_id: params.organizationId });
  await membership.save();
  return membership;
}

export class InviteNotFoundError extends Error {
  constructor() {
    super('Invite not found.');
    this.name = 'InviteNotFoundError';
  }
}

export class InviteAlreadyResolvedError extends Error {
  constructor() {
    super('This invite has already been accepted.');
    this.name = 'InviteAlreadyResolvedError';
  }
}

/**
 * Thrown when the signed-in principal accepting an invite isn't the person
 * it was sent to. Detected by identity, not by re-comparing email strings:
 * `params.userId` is the caller's already-resolved `UserModel.id` (from
 * `ensureUserForFirebaseSession`, which itself matches by email), so any
 * mismatch here means the invite's email and the caller's session email
 * genuinely differ.
 */
export class InviteEmailMismatchError extends Error {
  constructor() {
    super('This invite was sent to a different email address than the signed-in account.');
    this.name = 'InviteEmailMismatchError';
  }
}

export interface AcceptInviteParams {
  organizationId: string;
  membershipId: string;
  userId: string;
}

export interface AcceptInviteResult {
  membership: MembershipModel;
  roleBinding: RoleBindingModel;
}

/** Accepts a pending invite: activates the membership and mints the role binding it promised. */
export async function acceptInvite(params: AcceptInviteParams): Promise<AcceptInviteResult> {
  const membership = await MembershipModel.init(params.membershipId, {
    organization_id: params.organizationId,
  });
  if (!membership) {
    throw new InviteNotFoundError();
  }
  if (membership.status !== 'invited') {
    throw new InviteAlreadyResolvedError();
  }
  if (membership.user_id !== params.userId) {
    throw new InviteEmailMismatchError();
  }

  membership.status = 'active';
  membership.accepted_at = new Date().toISOString();
  await membership.save();

  const roleBinding = new RoleBindingModel();
  roleBinding.principal_type = 'user';
  roleBinding.principal_id = params.userId;
  roleBinding.role = membership.role;
  roleBinding.scope_level = 'org';
  roleBinding.scope_id = params.organizationId;
  roleBinding.setPathParams({ organization_id: params.organizationId });
  await roleBinding.save();

  return { membership, roleBinding };
}
