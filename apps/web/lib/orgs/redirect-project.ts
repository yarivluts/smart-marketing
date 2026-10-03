import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { isActiveMembershipStatus } from '@/lib/orgs/membership-status';
import { listOrgProjects } from '@/lib/orgs/queries';

export async function redirectToFirstProject(locale: string, subpath: string = ''): Promise<never> {
  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2F${encodeURIComponent(subpath)}`);
  }

  const { memberships } = await resolveOrgSessionContext(session);
  const activeMemberships = memberships.filter((m) => isActiveMembershipStatus(m.status));
  if (activeMemberships.length === 0) {
    redirect(`/${locale}/orgs`);
  }

  const firstOrg = activeMemberships[0];
  try {
    const projects = await listOrgProjects(firstOrg.organizationId);
    if (projects.length > 0) {
      const suffix = subpath ? `/${subpath}` : '';
      redirect(`/${locale}/orgs/${firstOrg.organizationId}/projects/${projects[0].id}${suffix}`);
    }
  } catch {
    // Fall through to org hub
  }

  redirect(`/${locale}/orgs/${firstOrg.organizationId}`);
}
