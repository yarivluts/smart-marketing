import 'server-only';
import {
  acceptInvite as acceptInviteForOrganization,
  createOrganizationWithOwner,
  createProject as createProjectInOrganization,
  inviteMemberToOrganization,
  removeOrgMember,
  type AcceptInviteResult,
  type CreateOrganizationResult,
  type CreateProjectResult,
  type InvitableRole,
  type MembershipModel,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';

interface CreateOrganizationInput {
  name: string;
  ownerUserId: string;
}

export async function createOrganization(input: CreateOrganizationInput): Promise<CreateOrganizationResult> {
  await ensureFirestoreOrm();
  return createOrganizationWithOwner(input);
}

interface CreateProjectInput {
  organizationId: string;
  name: string;
  vertical?: string;
}

export async function createProject(input: CreateProjectInput): Promise<CreateProjectResult> {
  await ensureFirestoreOrm();
  return createProjectInOrganization(input);
}

interface InviteMemberInput {
  organizationId: string;
  email: string;
  role: InvitableRole;
  invitedByUserId: string;
}

export async function inviteMember(input: InviteMemberInput): Promise<MembershipModel> {
  await ensureFirestoreOrm();
  return inviteMemberToOrganization(input);
}

interface AcceptInviteInput {
  organizationId: string;
  membershipId: string;
  userId: string;
  callerEmailVerified: boolean;
}

export async function acceptInvite(input: AcceptInviteInput): Promise<AcceptInviteResult> {
  await ensureFirestoreOrm();
  return acceptInviteForOrganization(input);
}

interface RemoveMemberInput {
  organizationId: string;
  membershipId: string;
}

/** Revokes a pending invite or removes an active member — see `removeOrgMember`'s doc comment. */
export async function removeMember(input: RemoveMemberInput): Promise<void> {
  await ensureFirestoreOrm();
  return removeOrgMember(input.organizationId, input.membershipId);
}
