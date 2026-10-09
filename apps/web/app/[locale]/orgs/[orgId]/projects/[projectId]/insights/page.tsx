import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects, listProjectInsights, getPeerBenchmarksForProject } from '@/lib/orgs/queries';
import { buildInsightsView } from '@/lib/orgs/insights-view';
import { PeerBenchmarksHub } from '@/components/insights/peer-benchmarks-hub';
import { PpPage, PpCard } from '@/components/pastel/primitives';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Insights' });
  return { title: t('metaTitle') };
}

/**
 * A project's recent noteworthy findings (the `list_insights` MCP tool's web admin counterpart):
 * the same Firestore-backed fan-out over active tracking-broke alerts (KAN-36) and fired win-rule
 * events (KAN-65/66) `listProjectInsights` (`mcp-tools.service.ts`, KAN-75) already exposes to an
 * MCP-connected AI agent, but — the same shape of gap KAN-108/KAN-111/KAN-113 already closed for
 * `search_customers`/`query_funnel`/`query_cohort` — with no route or page anywhere under
 * `apps/web` ever calling it. Unlike those three, this tool never touches the warehouse (no
 * degraded-state handling needed here — see `ProjectInsight`'s own doc comment). Renders its own
 * `next-intl`-translated copy per insight kind via `buildInsightsView` rather than the MCP tool's
 * plain-English `title`/`detail` fields, to keep CLAUDE.md's "no hard-coded UI strings" rule intact.
 * Gated on `dashboards.write`, the same "whole feature is admin-only" posture the Funnel/Cohorts
 * pages already establish for this nav section.
 */
export default async function InsightsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Finsights`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/insights`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const [insights, peerBenchmarks] = await Promise.all([
    listProjectInsights(orgId, projectId),
    getPeerBenchmarksForProject(orgId, projectId).catch(() => undefined),
  ]);
  const view = buildInsightsView(insights);

  const t = await getTranslations({ locale, namespace: 'Insights' });

  return (
    <PpPage className="space-y-10">
      {/* Stitch Dynamic Peer Benchmarks Cockpit */}
      <PeerBenchmarksHub
        orgId={orgId}
        projectId={projectId}
        isDataConnected={true}
        initialTelemetry={peerBenchmarks}
      />

      {/* Real-Time Project Insights & Anomaly Feed */}
      <PpCard
        title={t('title', { projectName: project.name })}
        subtitle={t('description')}
      >
        {view.length === 0 ? (
          <p className="font-pp-body-sm text-pp-body-sm text-pp-on-surface-variant">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {view.map((insight) => (
              <li
                key={insight.id}
                className="flex flex-col gap-1 rounded-2xl border border-pp-outline-variant/50 bg-pp-surface-container-low p-4 font-pp-body-sm text-pp-body-sm shadow-2xs"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-pp-label-md text-pp-label-md font-bold text-pp-on-surface">
                    {t(insight.titleKey, insight.args)}
                  </span>
                  <span className="rounded-full bg-pp-surface-container px-2 py-0.5 font-pp-label-sm text-[10px] font-bold uppercase tracking-wider text-pp-outline">
                    {t(`severityLabel.${insight.severity}`)}
                  </span>
                </div>
                <span className="text-pp-on-surface-variant">{t(insight.detailKey, insight.args)}</span>
                <span className="text-[10px] text-pp-outline">{insight.occurredAt}</span>
              </li>
            ))}
          </ul>
        )}
      </PpCard>
    </PpPage>
  );
}
