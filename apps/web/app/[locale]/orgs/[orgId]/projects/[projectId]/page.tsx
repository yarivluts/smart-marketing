import { redirect } from 'next/navigation';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

/**
 * A newcomer opening a project lands on Growth Pilot (enter the website, approve what the AI proposes).
 * People without `ai.use` cannot open it, so they keep landing on Campaigns. The layout has already
 * checked sign-in and membership; this only picks the first screen.
 */
export default async function ProjectRootPage({ params }: PageProps): Promise<never> {
  const { locale, orgId, projectId } = await params;
  const base = `/${locale}/orgs/${orgId}/projects/${projectId}`;
  const session = await getServerSession();
  if (session) {
    const { user, bindings } = await resolveOrgSessionContext(session);
    if (can(bindings, { type: 'user', id: user.id }, 'ai.use', { orgId, projectId })) {
      redirect(`${base}/growth-pilot`);
    }
  }
  redirect(`${base}/campaigns`);
}
