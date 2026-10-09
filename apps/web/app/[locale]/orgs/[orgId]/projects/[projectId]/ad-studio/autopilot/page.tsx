import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects, getAutopilotTelemetryForProject } from '@/lib/orgs/queries';
import { PpPage } from '@/components/pastel/primitives';
import { AdStudioNavHeader } from '../components/ad-studio-nav-header';
import { AutopilotMonitor } from '../components/autopilot-monitor';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdStudioPage' });
  return { title: t('autopilotMetaTitle') };
}

/**
 * GrowthOS Ad Studio - Autopilot Pipeline Monitor:
 * Autonomous pacing radar, spend allocation guardrails, creative fatigue alerts,
 * and automated rollback action ledger.
 */
export default async function AutopilotPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fad-studio%2Fautopilot`);
  }

  const { memberships } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/ad-studio/autopilot`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const initialTelemetry = await getAutopilotTelemetryForProject(orgId, projectId);

  return (
    <PpPage className="space-y-8">
      <AdStudioNavHeader orgId={orgId} projectId={projectId} />
      <AutopilotMonitor
        orgId={orgId}
        projectId={projectId}
        projectName={project.name}
        initialTelemetry={initialTelemetry}
      />
    </PpPage>
  );
}
