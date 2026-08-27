import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects, listProjectInsights } from '@/lib/orgs/queries';
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
    notFound();
  }

  const insights = await listProjectInsights(orgId, projectId);
  const view = buildInsightsView(insights);

  const t = await getTranslations('Insights');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      {view.length === 0 ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {view.map((insight) => (
            <li key={insight.id} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{t(insight.titleKey, insight.args)}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t(`severityLabel.${insight.severity}`)}
                </span>
              </div>
              <span className="text-muted-foreground">{t(insight.detailKey, insight.args)}</span>
              <span className="text-xs text-muted-foreground">{insight.occurredAt}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
