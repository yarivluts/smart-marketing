import 'server-only';
import type { UserOrgMembership } from '@growthos/firebase-orm-models';
import { listOrgProjects } from '@/lib/orgs/queries';
import { isActiveMembershipStatus } from '@/lib/orgs/membership-status';

/** One organization the person belongs to, with its projects, as the sidebar's workspace switcher lists them. */
export interface Workspace {
  orgId: string;
  orgName: string;
  projects: { id: string; name: string }[];
}

/**
 * Every organization the person is an active member of (never a pending invite or a suspended
 * membership, which would 404), each with its projects - the switcher's whole list. Project lists are
 * cached per request, so the shell that also lists the current org's projects reads them once.
 */
export async function loadWorkspaces(memberships: readonly UserOrgMembership[]): Promise<Workspace[]> {
  const active = memberships.filter((membership) => isActiveMembershipStatus(membership.status));
  return Promise.all(
    active.map(async (membership) => ({
      orgId: membership.organizationId,
      orgName: membership.organizationName,
      projects: (await listOrgProjects(membership.organizationId)).map((project) => ({ id: project.id, name: project.name })),
    })),
  );
}
