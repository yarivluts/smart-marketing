import {
  INVITABLE_ROLES,
  invitableRolesForScope,
  isInvitableRole,
  isInviteRole,
  isProjectInvitableRole,
  PROJECT_INVITABLE_ROLES,
  type InvitableRole,
  type InviteRole,
  type ProjectInvitableRole,
} from '@growthos/shared';
import { MembershipModel } from '../models/membership.model';
import { RoleBindingModel } from '../models/role-binding.model';
import { ProjectModel } from '../models/project.model';
import { ProjectNotFoundError } from './resource-library.service';
import { ensureUserByEmail } from './user.service';
import { recordAuditLogEntry } from './audit-log.service';

// Re-exported for convenience — `@growthos/shared` is the source of truth
// (it has no Firebase dependency, so client components can import it
// directly without pulling the whole ORM into their bundle).
export { INVITABLE_ROLES, PROJECT_INVITABLE_ROLES, invitableRolesForScope, isInvitableRole, isInviteRole, isProjectInvitableRole };
export type { InvitableRole, InviteRole, ProjectInvitableRole };
// `ProjectNotFoundError` (thrown below when an invite's `projectId` doesn't
// belong to `organizationId`) is not re-exported here — it's already the
// canonical export from `resource-library.service.ts` (`export *`-ed by
// `index.ts`), and re-exporting the same class from two modules risks an
// ambiguous-export collision at the barrel.

export class MembershipAlreadyExistsError extends Error {
  constructor() {
    super('This person already has a membership (active or pending) in this organization.');
    this.name = 'MembershipAlreadyExistsError';
  }
}

export interface InviteMemberParams {
  organizationId: string;
  email: string;
  role: InviteRole;
  invitedByUserId: string;
  /**
   * Required when `role` is project-scoped ({@link isProjectInvitableRole}
   * — `project_admin`/`editor`/`operator`) and must name a project that
   * belongs to `organizationId`; must be omitted when `role` is org-scoped
   * ({@link isInvitableRole} — `org_admin`/`viewer`). See
   * {@link ProjectRequiredForRoleError}/{@link ProjectScopedRoleNotAllowedError}.
   */
  projectId?: string;
}

/** Thrown by {@link inviteMemberToOrganization} for a project-scoped `role` with no `projectId`. */
export class ProjectRequiredForRoleError extends Error {
  constructor() {
    super('This role must be granted for a specific project — pass a projectId.');
    this.name = 'ProjectRequiredForRoleError';
  }
}

/** Thrown by {@link inviteMemberToOrganization} for an org-scoped `role` with a `projectId`. */
export class ProjectScopedRoleNotAllowedError extends Error {
  constructor() {
    super('This role is granted at the organization level and cannot be scoped to a project.');
    this.name = 'ProjectScopedRoleNotAllowedError';
  }
}

/**
 * Invites someone to an org by email. Works whether or not they've signed up
 * yet — `ensureUserByEmail` creates a placeholder `UserModel` row if needed,
 * which `ensureUserForFirebaseSession` (in `user.service.ts`) later links to
 * their real Firebase UID the first time they authenticate with a matching
 * email, so `MembershipModel.user_id` never needs to change at acceptance.
 *
 * Validates the role/scope pairing `INVITABLE_ROLES`'s own doc comment
 * describes (KAN-135): a project-scoped `role` requires `projectId`, naming
 * a project that actually belongs to `organizationId` (an id belonging to a
 * *different* org — or no project at all — throws the same
 * `ProjectNotFoundError` `resource-library.service.ts` already uses for
 * this exact "project not found in this organization" shape, so a caller
 * can't distinguish "wrong org" from "no such project"); an org-scoped
 * `role` must not carry a `projectId` at all — silently ignoring it would
 * risk minting org-wide access for a caller who thought they were scoping
 * to one project. The validated `projectId` (if any) is stored on the
 * membership itself (`MembershipModel.project_id`) so `acceptInvite` can
 * mint the role binding at the right scope without re-deriving it.
 *
 * Like `removeMembershipCascade`, this is a check-then-act read/write with
 * no transaction (the ORM's client-SDK-based API doesn't expose one): two
 * genuinely concurrent calls for the same email/org (not the common
 * double-click case, which the UI already guards against by disabling the
 * submit button) could both pass the duplicate check before either write
 * lands, producing two membership rows. Accepted as a known, low-likelihood
 * gap rather than solved here — the same tradeoff already made for
 * `removeMembershipCascade`.
 */
export async function inviteMemberToOrganization(params: InviteMemberParams): Promise<MembershipModel> {
  if (isProjectInvitableRole(params.role)) {
    if (!params.projectId) {
      throw new ProjectRequiredForRoleError();
    }
    const project = await ProjectModel.init(params.projectId, { organization_id: params.organizationId });
    if (!project || project.organization_id !== params.organizationId) {
      throw new ProjectNotFoundError();
    }
  } else if (params.projectId) {
    throw new ProjectScopedRoleNotAllowedError();
  }

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
  membership.project_id = params.projectId;
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

/**
 * Thrown when the caller's identity resolved via an unverified email. Firebase
 * lets anyone sign up with any email/password before that email is ever
 * confirmed, and `ensureUserForFirebaseSession` links a session to an
 * existing (e.g. invite-placeholder) `UserModel` row purely by email match —
 * so without this gate, an attacker who merely knows a target's email could
 * sign up with it first, get resolved to the same placeholder identity the
 * invite was created for, and accept the invite before the real invitee ever
 * gets the chance. Requiring a verified email closes the privilege-escalation
 * path: an attacker who doesn't control the inbox can never satisfy it.
 */
export class EmailNotVerifiedError extends Error {
  constructor() {
    super('Verify your email address before accepting this invite.');
    this.name = 'EmailNotVerifiedError';
  }
}

export interface AcceptInviteParams {
  organizationId: string;
  membershipId: string;
  userId: string;
  callerEmailVerified: boolean;
}

export interface AcceptInviteResult {
  membership: MembershipModel;
  roleBinding: RoleBindingModel;
}

/**
 * Accepts a pending invite: activates the membership and mints the role
 * binding it promised — at `scope_level: 'project'` (`scope_id:
 * membership.project_id`) when the invite was project-scoped, or
 * `scope_level: 'org'` (`scope_id: organizationId`) otherwise, per
 * `MembershipModel.project_id`'s own doc comment (KAN-135). Same
 * non-atomicity caveat as `inviteMemberToOrganization` — two genuinely
 * concurrent accept calls for the same membership could both pass the
 * `status !== 'invited'` check before either write lands, minting two role
 * bindings for the same grant. The client already disables the accept
 * button once clicked, so the realistic trigger is a duplicated network
 * request, not a UI double-click; `removeMembershipCascade` would still
 * clean up both bindings together if the membership is ever removed.
 */
export async function acceptInvite(params: AcceptInviteParams): Promise<AcceptInviteResult> {
  const membership = await MembershipModel.init(params.membershipId, {
    organization_id: params.organizationId,
  });
  if (!membership) {
    throw new InviteNotFoundError();
  }
  // Identity is checked before the invite's own state (status, verification)
  // so that a caller who was never the invitee learns nothing about whether
  // the invite has already been accepted — they always get the same
  // "wrong account" error regardless of the invite's actual state.
  if (membership.user_id !== params.userId) {
    throw new InviteEmailMismatchError();
  }
  if (membership.status !== 'invited') {
    throw new InviteAlreadyResolvedError();
  }
  if (!params.callerEmailVerified) {
    throw new EmailNotVerifiedError();
  }

  membership.status = 'active';
  membership.accepted_at = new Date().toISOString();
  await membership.save();

  const roleBinding = new RoleBindingModel();
  roleBinding.principal_type = 'user';
  roleBinding.principal_id = params.userId;
  roleBinding.role = membership.role;
  roleBinding.scope_level = membership.project_id ? 'project' : 'org';
  roleBinding.scope_id = membership.project_id ?? params.organizationId;
  roleBinding.setPathParams({ organization_id: params.organizationId });
  await roleBinding.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      actorType: 'user',
      actorId: params.userId,
      action: 'membership.role_granted',
      targetType: 'membership',
      targetId: membership.id,
      summary: `Accepted invite and granted role "${membership.role}"`,
      after: { role: membership.role },
    });
  } catch {
    // Best-effort — audit logging must never turn a successful invite acceptance into a failure for the caller.
  }

  return { membership, roleBinding };
}
