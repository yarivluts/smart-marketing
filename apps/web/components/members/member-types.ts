export type MemberRole = 'org_admin' | 'project_admin' | 'editor' | 'operator' | 'viewer';
export type MemberStatus = 'active' | 'suspended' | 'pending';

export interface MemberItem {
  membershipId: string;
  userId?: string;
  name: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  joinedAt?: string;
  avatarUrl?: string;
}

export interface AdministeredProject {
  id: string;
  name: string;
}
