import 'server-only';
import {
  acceptInvite as acceptInviteForOrganization,
  createOrganizationWithOwner,
  createProject as createProjectInOrganization,
  inviteMemberToOrganization,
  type AcceptInviteResult,
  type CreateOrganizationResult,
  type CreateProjectResult,
  type InvitableRole,
  type MembershipModel,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';

export interface CreateOrganizationInput {
  name: string;
  ownerUserId: string;
}

export async function createOrganization(input: CreateOrganizationInput): Promise<CreateOrganizationResult> {
  await ensureFirestoreOrm();
  return createOrganizationWithOwner(input);
}

export interface CreateProjectInput {
  organizationId: string;
  name: string;
  vertical?: string;
}

export async function createProject(input: CreateProjectInput): Promise<CreateProjectResult> {
  await ensureFirestoreOrm();
  return createProjectInOrganization(input);
}

export interface InviteMemberInput {
  organizationId: string;
  email: string;
  role: InvitableRole;
  invitedByUserId: string;
}

export async function inviteMember(input: InviteMemberInput): Promise<MembershipModel> {
  await ensureFirestoreOrm();
  return inviteMemberToOrganization(input);
}

export interface AcceptInviteInput {
  organizationId: string;
  membershipId: string;
  userId: string;
}

export async function acceptInvite(input: AcceptInviteInput): Promise<AcceptInviteResult> {
  await ensureFirestoreOrm();
  return acceptInviteForOrganization(input);
}
