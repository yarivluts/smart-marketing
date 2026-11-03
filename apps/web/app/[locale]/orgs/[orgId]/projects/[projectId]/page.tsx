import { redirect } from 'next/navigation';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

/**
 * A newcomer opening a project lands on Growth Pilot (enter the website, approve what the AI proposes).
 * People without `ai.use` land on the first workspace screen their role can open: Campaigns for
 * dashboard/cockpit roles, Installation for `ingest_only`, Project Settings for `project.manage`, or
 * Project Resources as the universal member fallback.
 */
export default async function ProjectRootPage({ params }: PageProps): Promise<never> {
  const { locale, orgId, projectId } = await params;
  const base = `/${locale}/orgs/${orgId}/projects/${projectId}`;
  const session = await getServerSession();
  if (session) {
    const { user, bindings } = await resolveOrgSessionContext(session);
    const principal = { type: 'user' as const, id: user.id };
    const scope = { orgId, projectId };
    if (can(bindings, principal, 'ai.use', scope)) {
      redirect(`${base}/growth-pilot`);
    }
    if (
      can(bindings, principal, 'automation.execute', scope) ||
      can(bindings, principal, 'dashboards.read', scope) ||
      can(bindings, principal, 'dashboards.write', scope)
    ) {
      redirect(`${base}/campaigns`);
    }
    if (can(bindings, principal, 'ingest.write', scope)) {
      redirect(`${base}/install`);
    }
    if (can(bindings, principal, 'project.manage', scope)) {
      redirect(`${base}/settings`);
    }
    redirect(`${base}/resources`);
  }
  redirect(`${base}/campaigns`);
}
