import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowUpRight, CalendarRange, Coins, Flame, GitBranch, ListChecks, PlusCircle, Trophy, Zap } from 'lucide-react';
import { can } from '@growthos/shared';
import { DEFAULT_WIN_EVENT_LIST_LIMIT } from '@growthos/firebase-orm-models';
import { splitOverFetchedFeed } from '@/lib/orgs/capped-list-view';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  getRepCollectionLeaderboardForProject,
  getTrialPipelineSummary,
  listActiveEventSchemaNames,
  listOrgPeople,
  listOrgProjects,
  listRecentWinEventsForProject,
  listWinRulesForProject,
} from '@/lib/orgs/queries';
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
import { buildWinRuleFlow, countWinsByRule, toWinEventFeedItem, toWinRuleSummaryView, toWinTrend } from '@/lib/orgs/win-rule-view';
import { toTrialPipelineWidgetView } from '@/lib/orgs/trial-pipeline-view';
import { toRepCollectionLeaderboardView } from '@/lib/orgs/rep-collection-view';
import { CreateWinRuleForm } from '@/components/orgs/create-win-rule-form';
import { WinRuleList } from '@/components/orgs/win-rule-list';
import { LiveWinFeed } from '@/components/orgs/live-win-feed';
import { WinEventHistoryList } from '@/components/orgs/win-event-history-list';
import { TrialPipelineWidget } from '@/components/orgs/trial-pipeline-widget';
import { StatCard } from '@/components/ui/stat-card';
import { BarList, ChartCard, EmptyState, FlowDiagram, PageHero, TrendChart } from '@/components/viz';
import { Link } from '@/i18n/navigation';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'WinRules' });
  return { title: t('metaTitle') };
}

/** Days of history the wins-per-day chart covers. */
const TREND_DAYS = 14;

/**
 * A project's win rules (KAN-65, E12.2, plan `04 §6`): every rule defined in
 * this project, a form to create a new one, and a live feed of wins fired in
 * real time — gated on `dashboards.write` for the whole page, the same
 * "whole feature, not just mutation, is admin-only" posture `goals/page.tsx`
 * (which this page mirrors) uses.
 *
 * Per-rule win counts, the trigger -> rule -> feed diagram and the wins-per-day
 * chart are all computed from the same capped recent-wins read the history list
 * renders, and say so: they describe the most recent wins, not all time.
 */
export default async function WinRulesPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fwin-rules`);
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

  // KAN-196: every read below is scoped to the environment picked in the project shell (prod by default).
  const { selected: selectedEnvironment } = await resolveSelectedEnvironment(orgId, projectId);
  const environmentScope = { environmentId: selectedEnvironment?.id };
  const [winRules, eventSchemaNames, trialPipelineOutcome, recentWinEvents, repCollectionLeaderboard, people] = await Promise.all([
    listWinRulesForProject(orgId, projectId),
    listActiveEventSchemaNames(orgId, projectId),
    getTrialPipelineSummary(orgId, projectId, environmentScope),
    listRecentWinEventsForProject(orgId, projectId, DEFAULT_WIN_EVENT_LIST_LIMIT + 1, environmentScope),
    getRepCollectionLeaderboardForProject(orgId, projectId, 'week'),
    listOrgPeople(orgId),
  ]);
  const winRuleViews = winRules.map(toWinRuleSummaryView);
  const trialPipelineView = toTrialPipelineWidgetView(trialPipelineOutcome);
  const winEventPage = splitOverFetchedFeed(recentWinEvents, DEFAULT_WIN_EVENT_LIST_LIMIT);
  const winEventHistoryViews = winEventPage.rows.map(toWinEventFeedItem);
  const repCollectionLeaderboardView = toRepCollectionLeaderboardView(
    repCollectionLeaderboard,
    new Map(people.map((person) => [person.id, person.name])),
  );
  const t = await getTranslations('WinRules');
  const tCollections = await getTranslations('RepCollectionLeaderboard');

  const numberFormat = new Intl.NumberFormat(locale);
  const dayFormat = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const winCounts = countWinsByRule(winEventHistoryViews);
  const activeRules = winRuleViews.filter((rule) => rule.active);
  const firedRules = winRuleViews.filter((rule) => (winCounts.get(rule.id) ?? 0) > 0);
  const topRule = [...winRuleViews].sort((a, b) => (winCounts.get(b.id) ?? 0) - (winCounts.get(a.id) ?? 0))[0];
  const topRuleWins = topRule ? (winCounts.get(topRule.id) ?? 0) : 0;
  const trend = toWinTrend(winEventHistoryViews, { now: new Date(), days: TREND_DAYS, truncated: winEventPage.truncated });
  const flow = buildWinRuleFlow(winRuleViews, winCounts, {
    action: t('flowActionLabel'),
    actionSublabel: t('flowActionSublabel'),
    schemaSublabel: t('flowSchemaSublabel'),
    inactive: t('statusInactive'),
    formatWins: (count) => t('ruleWinCount', { count }),
    schemaHref: (schemaName) => `/orgs/${orgId}/projects/${projectId}/record-feed?schema=${encodeURIComponent(schemaName)}`,
  });
  const winsLabel = winEventPage.truncated ? t('kpiWinsTruncated', { count: winEventHistoryViews.length }) : numberFormat.format(winEventHistoryViews.length);
  const formatCollectionAmount = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={Trophy} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('description')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            title={t('kpiActiveRules')}
            value={numberFormat.format(activeRules.length)}
            subtext={t('kpiOfTotalRules', { count: winRuleViews.length })}
            progress={winRuleViews.length > 0 ? Math.round((activeRules.length / winRuleViews.length) * 100) : undefined}
            icon={Zap}
          />
          <StatCard title={t('kpiRecentWins')} value={winsLabel} icon={Trophy} />
          <StatCard title={t('kpiRulesFired')} value={numberFormat.format(firedRules.length)} subtext={t('kpiOfTotalRules', { count: winRuleViews.length })} icon={Flame} />
          <StatCard
            title={t('kpiTopRule')}
            value={topRule && topRuleWins > 0 ? topRule.name : t('kpiNoValue')}
            subtext={topRule && topRuleWins > 0 ? t('ruleWinCount', { count: topRuleWins }) : undefined}
            icon={ListChecks}
          />
        </div>
      </PageHero>

      <ChartCard title={t('flowTitle')} description={t('flowDescription')} icon={GitBranch}>
        {winRuleViews.length === 0 ? (
          <EmptyState icon={GitBranch} title={t('noWinRules')} description={t('flowEmptyDetail')} compact />
        ) : (
          <FlowDiagram label={t('flowTitle')} nodes={flow.nodes} edges={flow.edges} height={Math.min(520, Math.max(260, winRuleViews.length * 104 + 60))} />
        )}
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-5">
        <ChartCard
          title={t('trendTitle')}
          description={t('trendDescription', { days: TREND_DAYS })}
          icon={CalendarRange}
          className="lg:col-span-3"
          fill
          footer={trend.reliableFrom ? t('trendPartialNotice', { count: winEventHistoryViews.length }) : undefined}
        >
          {winEventHistoryViews.length === 0 ? (
            <EmptyState icon={Trophy} title={t('historyEmpty')} compact />
          ) : (
            <TrendChart
              label={t('trendTitle')}
              xKey="day"
              kind="bar"
              data={trend.buckets.map((bucket) => ({ day: dayFormat.format(new Date(bucket.start)), wins: bucket.count }))}
              series={[{ key: 'wins', label: t('trendSeries'), color: 'hsl(var(--success))' }]}
              height={320}
            />
          )}
        </ChartCard>
        <div className="flex flex-col gap-6 lg:col-span-2">
          <TrialPipelineWidget view={trialPipelineView} />
          <ChartCard
            title={tCollections('heading')}
            icon={Coins}
            fill
            actions={
              <Link
                href={{ pathname: `/orgs/${orgId}/projects/${projectId}/rep-collections` }}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                {t('openLedger')}
                <ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
              </Link>
            }
            footer={
              repCollectionLeaderboardView.unattributedCount > 0
                ? tCollections('unattributed', {
                    amount: formatCollectionAmount(repCollectionLeaderboardView.unattributedTotal),
                    count: repCollectionLeaderboardView.unattributedCount,
                  })
                : undefined
            }
          >
            {repCollectionLeaderboardView.rows.length === 0 ? (
              <EmptyState icon={Coins} title={tCollections('empty')} compact />
            ) : (
              <BarList
                items={repCollectionLeaderboardView.rows.map((row, index) => ({
                  key: row.orgPersonId,
                  label: tCollections('rank', { rank: index + 1, name: row.name }),
                  value: row.totalAmount,
                }))}
                maxItems={5}
                valueFormatter={formatCollectionAmount}
                color="hsl(var(--success))"
              />
            )}
          </ChartCard>
        </div>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="win-rules-heading">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 id="win-rules-heading" className="text-lg font-semibold">
            {t('rulesHeading')}
          </h2>
        </div>
        <WinRuleList orgId={orgId} projectId={projectId} winRules={winRuleViews} winCounts={Object.fromEntries(winCounts)} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Persisted history (KAN-65 follow-up, session-B dogfooding QA 2026-08-18): the live feed
          beside it is a broadcast-only view that shows nothing once the tab wasn't open when a win fired
          — this section is the page-load render of the same `win_events` collection so nothing is
          missed. */}
        <WinEventHistoryList events={winEventHistoryViews} truncated={winEventPage.truncated} />
        <LiveWinFeed orgId={orgId} projectId={projectId} />
      </div>

      <ChartCard title={t('createHeading')} description={t('createDescription')} icon={PlusCircle}>
        {eventSchemaNames.length === 0 ? <EmptyState icon={PlusCircle} title={t('noEventSchemas')} compact /> : null}
        {eventSchemaNames.length > 0 ? <CreateWinRuleForm orgId={orgId} projectId={projectId} eventSchemaNames={eventSchemaNames} /> : null}
      </ChartCard>
    </main>
  );
}
