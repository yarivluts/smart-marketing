import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listOrgProjects,
  listPluginInstallsForProject,
} from '@/lib/orgs/queries';
import { toPluginInstallView } from '@/lib/orgs/plugin-view';
import { PpPage } from '@/components/pastel/primitives';
import { ExecutiveCommandCenter } from '@/components/dashboard/executive-command-center';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ExecutiveReport' });
  return { title: t('metaTitle') || 'Executive Command Center | GrowthOS' };
}

/**
 * Flagship Executive Command Center & Pulse Dashboard (Stitch Screen 3458ff3a, mobile a3b6ca32)
 * Real-time cross-channel performance, intraday spend vs revenue pacing, live conversion feed,
 * proactive AI Copilot recommendations, and contextual missing-integration alerts.
 */
export default async function ProjectRootPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  const principal = { type: 'user' as const, id: user.id };

  const canReadDashboards = can(bindings, principal, 'dashboards.read', { orgId });
  const canWriteDashboards = can(bindings, principal, 'dashboards.write', { orgId });
  const canExecute = can(bindings, principal, 'automation.execute', { orgId });

  if (!membership || (!canReadDashboards && !canWriteDashboards && !canExecute)) {
    notFound();
  }

  const [projects, rawInstalls] = await Promise.all([
    listOrgProjects(orgId),
    listPluginInstallsForProject(orgId, projectId).catch(() => []),
  ]);

  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const installs = rawInstalls.map(toPluginInstallView);
  const activeConnectors = installs
    .filter((install) => install.status === 'installed')
    .map((install) => install.pluginId);

  // Cross-reference with verified requirements for instant sync across dashboards
  const verifiedReqs = new Set(project.verified_requirements ?? []);
  if (verifiedReqs.has('req_stripe_billing') || verifiedReqs.has('req_checkout_stream')) {
    if (!activeConnectors.includes('stripe')) activeConnectors.push('stripe');
  }
  if (verifiedReqs.has('req_ad_attribution')) {
    if (!activeConnectors.includes('google_ads')) activeConnectors.push('google_ads');
    if (!activeConnectors.includes('meta_ads')) activeConnectors.push('meta_ads');
  }
  if (verifiedReqs.has('req_web_sdk')) {
    if (!activeConnectors.includes('growthos_sdk')) activeConnectors.push('growthos_sdk');
  }
  if (verifiedReqs.has('req_lead_crm')) {
    if (!activeConnectors.includes('hubspot')) activeConnectors.push('hubspot');
  }

  const requiredConnectors = ['stripe', 'google_ads', 'meta_ads'];
  const missingConnectors = requiredConnectors.filter((c) => !activeConnectors.includes(c));
  const isDataConnected = activeConnectors.length > 0;

  return (
    <PpPage>
      <ExecutiveCommandCenter
        projectName={project.name}
        isDataConnected={isDataConnected}
        missingConnectors={missingConnectors}
      />
    </PpPage>
  );
}
