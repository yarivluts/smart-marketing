import 'server-only';
import {
  listOrgMembersWithProfiles,
  listOrgProjects as listOrgProjectsForOrganization,
  MembershipModel,
  OrganizationModel,
  UserModel,
  type MembershipStatus,
  type OrgMemberSummary,
  type ProjectModel,
  type Role,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';

export async function listOrgMembers(organizationId: string): Promise<OrgMemberSummary[]> {
  await ensureFirestoreOrm();
  return listOrgMembersWithProfiles(organizationId);
}

export async function listOrgProjects(organizationId: string): Promise<ProjectModel[]> {
  await ensureFirestoreOrm();
  return listOrgProjectsForOrganization(organizationId);
}

export interface InviteDetails {
  organizationId: string;
  organizationName: string;
  membershipId: string;
  role: Role;
  status: MembershipStatus;
  inviteeUserId: string;
  inviteeEmail: string;
}

/** Loads the details an invite-accept page needs to render, or `null` if the invite/org doesn't exist. */
export async function getInviteDetails(organizationId: string, membershipId: string): Promise<InviteDetails | null> {
  await ensureFirestoreOrm();
  const membership = await MembershipModel.init(membershipId, { organization_id: organizationId });
  if (!membership) {
    return null;
  }

  const [organization, invitee] = await Promise.all([
    OrganizationModel.init(organizationId),
    UserModel.init(membership.user_id),
  ]);
  if (!organization) {
    return null;
  }

  return {
    organizationId,
    organizationName: organization.name,
    membershipId: membership.id,
    role: membership.role,
    status: membership.status ?? 'active',
    inviteeUserId: membership.user_id,
    inviteeEmail: invitee?.email ?? '',
  };
}
