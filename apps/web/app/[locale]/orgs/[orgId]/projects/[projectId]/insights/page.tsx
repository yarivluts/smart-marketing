import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { Activity, AlertTriangle, BarChart3, Clock, Lightbulb, PieChart, RadioTower, Rows3, ShieldAlert, Trophy } from 'lucide-react';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects, listProjectInsights } from '@/lib/orgs/queries';
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
import { buildInsightsView } from '@/lib/orgs/insights-view';
import { splitOverFetchedFeed } from '@/lib/orgs/billing-ops-view';
import { groupInsightsByDay, insightKind, insightsPerDay, summarizeInsights, type InsightKind } from '@/lib/orgs/growth-viz';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard, DonutChart, EmptyState, PageHero, TrendChart } from '@/components/viz';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

/** How many insights this page renders. Matches `listProjectInsights`'s own default so the page shows what the MCP tool would return for the same project. */
const INSIGHTS_PAGE_SIZE = 20;

const KIND_ICON: Record<InsightKind, typeof Trophy> = {
  tracking_alert: RadioTower,
  win_event: Trophy,
  metric_health: ShieldAlert,
};

const KIND_COLOR: Record<InsightKind, string> = {
  tracking_alert: 'hsl(var(--warning))',
  win_event: 'hsl(var(--success))',
  metric_health: 'hsl(var(--destructive))',
};

/** Where each kind of finding is fixed or followed up. */
const KIND_ROUTE: Record<InsightKind, string> = {
  tracking_alert: 'ingest-health',
  win_event: 'win-rules',
  metric_health: 'metric-defs',
};

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
 * The counts and charts summarise exactly the insights listed in the feed, nothing more.
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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId, projectId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  // KAN-196: win insights are scoped to the environment picked in the project
  // shell (prod by default). Tracking-alert and metric-health insights are
  // project-wide in `listProjectInsights` itself, the same as for its MCP caller.
  const { selected: selectedEnvironment } = await resolveSelectedEnvironment(orgId, projectId);
  const environmentScope = { environmentId: selectedEnvironment?.id };

  // Over-fetch by one so truncation is measured, not inferred: `length === cap`
  // cannot tell "exactly this many exist" from "far more exist", and this page
  // is read as the list of everything wrong with the project. A capped list of
  // problems with nothing saying it is capped is read as the full set of
  // problems — the same defect class as KAN-114/138/146, but here the thing
  // being under-reported is what the user is supposed to act on.
  const fetched = await listProjectInsights(orgId, projectId, INSIGHTS_PAGE_SIZE + 1, environmentScope);
  const { rows, truncated } = splitOverFetchedFeed(fetched, INSIGHTS_PAGE_SIZE);
  const view = buildInsightsView(rows);
  const summary = summarizeInsights(view);
  const perDay = insightsPerDay(view);
  const days = groupInsightsByDay(view);

  const t = await getTranslations('Insights');
  const numberFormat = new Intl.NumberFormat(locale);
  const dayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const shortDayFormat = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const timeFormat = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  const formatDate = (value: string, format: Intl.DateTimeFormat): string => {
    const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
    return Number.isNaN(date.getTime()) ? value : format.format(date);
  };
  const projectBase = `/orgs/${orgId}/projects/${projectId}`;

  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={Lightbulb} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('description')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiTotal')} value={numberFormat.format(summary.total)} icon={Rows3} subtext={truncated ? t('kpiTotalCapped') : undefined} />
          <StatCard title={t('kpiWarnings')} value={numberFormat.format(summary.warnings)} icon={AlertTriangle} />
          <StatCard title={t('kpiWins')} value={numberFormat.format(summary.byKind.win_event)} icon={Trophy} />
          <StatCard
            title={t('kpiLatest')}
            value={summary.latestAt ? formatDate(summary.latestAt, shortDayFormat) : t('kpiNoValue')}
            subtext={summary.latestAt ? t('timeUtc', { time: formatDate(summary.latestAt, timeFormat) }) : undefined}
            icon={Clock}
          />
        </div>
      </PageHero>

      {view.length === 0 ? (
        <EmptyState icon={Lightbulb} title={t('empty')} description={t('emptyNextStep')} />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-5">
            <ChartCard title={t('byTypeTitle')} description={t('byTypeDescription')} icon={PieChart} className="lg:col-span-2" fill>
              <DonutChart
                label={t('byTypeTitle')}
                size={150}
                centerValue={numberFormat.format(summary.total)}
                centerLabel={t('byTypeCenter')}
                data={(Object.keys(summary.byKind) as InsightKind[])
                  .filter((kind) => summary.byKind[kind] > 0)
                  .map((kind) => ({ label: t(`kindLabel.${kind}`), value: summary.byKind[kind], color: KIND_COLOR[kind] }))}
              />
            </ChartCard>
            <ChartCard title={t('perDayTitle')} description={t('perDayDescription')} icon={BarChart3} className="lg:col-span-3" fill>
              <TrendChart
                label={t('perDayTitle')}
                xKey="day"
                data={perDay.map((entry) => ({ day: formatDate(entry.day, shortDayFormat), warning: entry.warning, info: entry.info }))}
                series={[
                  { key: 'warning', label: t('severityLabel.warning'), color: 'hsl(var(--warning))' },
                  { key: 'info', label: t('severityLabel.info'), color: 'hsl(var(--info))' },
                ]}
                kind="bar"
                stacked
                height={220}
              />
            </ChartCard>
          </div>

          <ChartCard title={t('feedTitle')} description={t('feedDescription')} icon={Activity}>
            <ol className="flex flex-col gap-6" data-testid="insights-timeline">
              {days.map((group) => (
                <li key={group.day} className="flex flex-col gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{formatDate(group.day, dayFormat)}</h3>
                  <ol className="relative flex flex-col gap-3 border-s-2 border-border/70 ps-6">
                    {group.items.map((insight) => {
                      const kind = insightKind(insight);
                      const Icon = KIND_ICON[kind];
                      const warning = insight.severity === 'warning';
                      return (
                        <li key={insight.id} className="relative" data-testid={`insight-${insight.id}`} data-severity={insight.severity}>
                          <span
                            className={cn(
                              'absolute -start-[37px] top-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-card',
                              warning ? 'bg-warning text-warning-foreground' : kind === 'win_event' ? 'bg-success text-success-foreground' : 'bg-info text-info-foreground',
                            )}
                            aria-hidden="true"
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <div className={cn('flex flex-col gap-1.5 rounded-xl border p-3 text-sm', warning ? 'border-warning/40 bg-warning/5' : 'border-border bg-card')}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <span className="min-w-0 font-medium text-foreground">{t(insight.titleKey, insight.args)}</span>
                              <span
                                className={cn(
                                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                                  warning ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground',
                                )}
                              >
                                {t(`severityLabel.${insight.severity}`)}
                              </span>
                            </div>
                            <span className="break-words text-muted-foreground">{t(insight.detailKey, insight.args)}</span>
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-2">
                                <span className="rounded-md bg-muted px-1.5 py-0.5">{t(`kindLabel.${kind}`)}</span>
                                <time dateTime={insight.occurredAt} dir="ltr">
                                  {t('timeUtc', { time: formatDate(insight.occurredAt, timeFormat) })}
                                </time>
                              </span>
                              <Link href={`${projectBase}/${KIND_ROUTE[kind]}`} className="font-medium text-primary underline-offset-4 hover:underline">
                                {t(`kindAction.${kind}`)}
                              </Link>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ol>
          </ChartCard>
        </>
      )}

      {truncated ? <p className="text-xs text-muted-foreground">{t('truncated', { count: INSIGHTS_PAGE_SIZE })}</p> : null}
    </div>
  );
}
