import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects, getVideoExportTelemetryForProject } from '@/lib/orgs/queries';
import { PpPage } from '@/components/pastel/primitives';
import { AdStudioNavHeader } from '../components/ad-studio-nav-header';
import { VideoExportConsole } from '../components/video-export-console';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdStudioPage' });
  return { title: t('exportMetaTitle') };
}

/**
 * GrowthOS Ad Studio - Video Assembly & Export Console:
 * Multi-format render timeline, 9:16 / 1:1 / 16:9 matrix, dynamic caption burn-in,
 * CAPI / ad network direct push, and render job queue.
 */
export default async function VideoExportPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fad-studio%2Fvideo-export`);
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
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/ad-studio/video-export`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const initialTelemetry = await getVideoExportTelemetryForProject(orgId, projectId, project.name);

  return (
    <PpPage className="space-y-8">
      <AdStudioNavHeader orgId={orgId} projectId={projectId} />
      <VideoExportConsole
        orgId={orgId}
        projectId={projectId}
        projectName={project.name}
        initialTelemetry={initialTelemetry}
      />
    </PpPage>
  );
}
