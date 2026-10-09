import { notFound, redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  getAttributionTelemetryForProject,
  listOrgProjects,
  listPluginInstallsForProject,
} from '@/lib/orgs/queries';
import { PpPage } from '@/components/pastel/primitives';
import { MultiTouchAttributionMatrix } from '@/components/attribution/multi-touch-attribution-matrix';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params: _params }: PageProps) {
  return { title: 'Attribution & Journey Intelligence | GrowthOS' };
}

/**
 * Multi-Touch Attribution Matrix (Stitch 2bc944e2e3c1498fb5add4a1aaebcac5):
 * Cross-channel Shapley value game-theoretic revenue attribution, Markov chain removal effects,
 * multi-touch lookback windows (30/60/90d), and top-converting omnichannel sequence pathways.
 */
export default async function AttributionPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fattribution`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  const principal = { type: 'user' as const, id: user.id };

  const canReadDashboards = can(bindings, principal, 'dashboards.read', { orgId });
  const canWriteDashboards = can(bindings, principal, 'dashboards.write', { orgId });

  if (!membership || (!canReadDashboards && !canWriteDashboards)) {
    notFound();
  }

  const [projects, installs, initialTelemetry] = await Promise.all([
    listOrgProjects(orgId),
    listPluginInstallsForProject(orgId, projectId).catch(() => []),
    getAttributionTelemetryForProject(orgId, projectId, { lookbackDays: 60 }).catch(() => null),
  ]);

  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/attribution`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const activePluginIds = new Set(
    installs
      .filter((i) => i.status === 'installed')
      .map((i) => i.plugin_id.toLowerCase()),
  );

  const hasAdConnector =
    activePluginIds.has('google_ads') ||
    activePluginIds.has('meta_ads') ||
    activePluginIds.has('tiktok_ads') ||
    activePluginIds.has('google') ||
    activePluginIds.has('meta');

  const hasTouchpointConnector =
    activePluginIds.has('growthos_sdk') ||
    activePluginIds.has('tracking_sdk') ||
    activePluginIds.has('sdk') ||
    activePluginIds.has('ga4') ||
    activePluginIds.has('google_analytics') ||
    activePluginIds.has('segment');

  const hasAttributionData = Boolean(
    initialTelemetry && initialTelemetry.channels && initialTelemetry.channels.length > 0,
  );

  const isDataConnected = (hasAdConnector && hasTouchpointConnector) || hasAttributionData || hasAdConnector;

  return (
    <PpPage className="space-y-8">
      <MultiTouchAttributionMatrix
        orgId={orgId}
        projectId={projectId}
        projectName={project.name}
        isDataConnected={isDataConnected}
        initialTelemetry={initialTelemetry ?? undefined}
      />
    </PpPage>
  );
}

