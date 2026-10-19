import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects } from '@/lib/orgs/queries';
import { LAST_PROJECT_COOKIE, parseLastProject } from '@/lib/auth/last-project';
import { chooseStartPath } from '@/lib/auth/start-path';

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

/**
 * Where signing in lands: straight in the project the person works in - the one they opened last,
 * or their only one - rather than an overview of every organization. People with several projects
 * and no recent one get the overview (/dashboard), where they pick.
 */
export default async function StartPage({ params }: PageProps): Promise<never> {
  const { locale } = await params;
  const session = await getServerSession();
  if (!session) redirect(`/${locale}/login`);
  const { memberships } = await resolveOrgSessionContext(session);
  const orgIds = [...new Set(memberships.map((membership) => membership.organizationId))].filter((orgId) => findActiveMembership(memberships, orgId));
  const projects = (await Promise.all(orgIds.map(async (orgId) => (await listOrgProjects(orgId)).map((project) => ({ orgId, projectId: project.id }))))).flat();
  const last = parseLastProject((await cookies()).get(LAST_PROJECT_COOKIE)?.value);
  redirect(`/${locale}${chooseStartPath(projects, last)}`);
}
