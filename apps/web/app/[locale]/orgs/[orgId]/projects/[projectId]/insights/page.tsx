import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listActiveTrackingAlertsForProject, listOrgProjects, listRecentWinEventsForProject } from '@/lib/orgs/queries';
import { buildInsightsView } from '@/lib/orgs/insights-view';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Insights' });
  return { title: t('metaTitle') };
}

/**
 * A project's Insights feed (KAN-114): the same two per-project "here is
 * something noteworthy" sources — active tracking-broke episodes (KAN-36)
 * and fired win-rule events (KAN-65/66) — the MCP server's own `list_insights`
 * tool (`listProjectInsights`) already merges for an AI agent, but until now
 * with no human-facing home: an operator could ask an MCP-connected agent
 * "anything noteworthy happen?" and get this exact merge back, but had no way
 * to see the same feed themselves in the web app, the same "no admin UI" gap
 * KAN-108/109/111/113 already closed for their own MCP tools. Both sources
 * are Firestore-backed, so (unlike Customers/Funnel/Cohorts) this page never
 * has a "warehouse not configured" state to degrade into. Gated on
 * `dashboards.write`, the same "whole feature is admin-only" posture
 * Goals/Segments/Win rules already use for this kind of analytics view.
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
    notFound();
  }

  const [alerts, wins] = await Promise.all([
    listActiveTrackingAlertsForProject(orgId, projectId),
    listRecentWinEventsForProject(orgId, projectId),
  ]);
  const insights = buildInsightsView(alerts, wins);

  const t = await getTranslations('Insights');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      {insights.length === 0 ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {insights.map((insight) => (
            <li key={`${insight.kind}:${insight.id}`} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">
                  {insight.kind === 'tracking_alert'
                    ? t('alertTitle', { schemaName: insight.schemaName })
                    : t('winTitle', { winRuleName: insight.winRuleName })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {insight.kind === 'tracking_alert' ? t('severityWarning') : t('severityInfo')}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {insight.kind === 'tracking_alert'
                  ? t('alertDetail', { schemaName: insight.schemaName, lastSeenAt: insight.lastSeenAt })
                  : t('winDetail', { schemaName: insight.schemaName, winRuleName: insight.winRuleName })}
              </span>
              <span className="text-xs text-muted-foreground">{t('occurredAtLine', { occurredAt: insight.occurredAt })}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
