import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listOrgProjects,
  listPluginInstallsForProject,
} from '@/lib/orgs/queries';
import { toPluginInstallView } from '@/lib/orgs/plugin-view';
import { IntegrationsHub } from '@/components/integrations/integrations-hub';
import { PpPage } from '@/components/pastel/primitives';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  try {
    const t = await getTranslations({ locale, namespace: 'IntegrationsHub' });
    return { title: t('metaTitle') };
  } catch {
    return { title: 'Integrations Hub | GrowthOS' };
  }
}

/**
 * Dedicated Missing & Active Integrations Hub (/integrations).
 * Bird's-eye health overview, 4-category directory, missing prerequisites triage,
 * and interactive step-by-step setup modals with live mock event verification.
 */
export default async function IntegrationsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fintegrations`);
  }

  const { memberships } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership) {
    notFound();
  }

  const [projects, rawInstalls] = await Promise.all([
    listOrgProjects(orgId),
    listPluginInstallsForProject(orgId, projectId).catch(() => []),
  ]);

  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/integrations`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const installs = rawInstalls.map(toPluginInstallView);
  const initialActiveConnectors = installs
    .filter((install) => install.status === 'installed')
    .map((install) => install.pluginId);

  return (
    <PpPage className="max-w-6xl space-y-8">
      <IntegrationsHub
        orgId={orgId}
        projectId={projectId}
        projectName={project.name}
        initialActiveConnectors={initialActiveConnectors}
      />
    </PpPage>
  );
}
