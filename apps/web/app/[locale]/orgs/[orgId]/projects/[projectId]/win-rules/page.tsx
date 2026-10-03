import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Plus, Sliders, Sparkles, TrendingUp, Trophy } from 'lucide-react';
import { can } from '@growthos/shared';
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
import { toWinEventFeedItem, toWinRuleSummaryView } from '@/lib/orgs/win-rule-view';
import { toTrialPipelineWidgetView } from '@/lib/orgs/trial-pipeline-view';
import { toRepCollectionLeaderboardView } from '@/lib/orgs/rep-collection-view';
import {
  PpButton,
  PpCard,
  PpKpiCard,
  PpKpiGrid,
  PpMobileActionBar,
  PpPage,
  PpPageHeader,
  PpPill,
} from '@/components/pastel/primitives';
import { CreateWinRuleForm } from '@/components/orgs/create-win-rule-form';
import { WinRuleList } from '@/components/orgs/win-rule-list';
import { LiveWinFeed } from '@/components/orgs/live-win-feed';
import { WinEventHistoryList } from '@/components/orgs/win-event-history-list';
import { TrialPipelineWidget } from '@/components/orgs/trial-pipeline-widget';
import { RepCollectionLeaderboardWidget } from '@/components/orgs/rep-collection-leaderboard-widget';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'WinRules' });
  return { title: t('metaTitle') };
}

/**
 * Stitch "Pastel Pulse" win rules & celebration stream (desktop 4b2e8917 / a29b3e9b / 820d7e79, mobile 7a218cb8 / 97717328 / 51797a60).
 *
 * Configures real-time event triggers for customer conversions, trial pipeline pacing,
 * sales sprint leaderboards, and live celebration broadcast feeds.
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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/win-rules`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const [winRules, eventSchemaNames, trialPipelineOutcome, recentWinEvents, repCollectionLeaderboard, people] =
    await Promise.all([
      listWinRulesForProject(orgId, projectId),
      listActiveEventSchemaNames(orgId, projectId),
      getTrialPipelineSummary(orgId, projectId),
      listRecentWinEventsForProject(orgId, projectId),
      getRepCollectionLeaderboardForProject(orgId, projectId, 'week'),
      listOrgPeople(orgId),
    ]);

  const winRuleViews = winRules.map(toWinRuleSummaryView);
  const trialPipelineView = toTrialPipelineWidgetView(trialPipelineOutcome);
  const winEventHistoryViews = recentWinEvents.map(toWinEventFeedItem);
  const repCollectionLeaderboardView = toRepCollectionLeaderboardView(
    repCollectionLeaderboard,
    new Map(people.map((person) => [person.id, person.name])),
  );
  const t = await getTranslations('WinRules');

  const activeRulesCount = winRuleViews.filter((r) => r.active).length;
  const topCloser = repCollectionLeaderboardView.rows[0];

  return (
    <PpPage>
      <PpPageHeader
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        description={t('description')}
        actions={
          <PpButton variant="primary" size="sm" icon={Plus} asChild>
            <a href="#rule-builder">
              <span>{t('createHeading')}</span>
            </a>
          </PpButton>
        }
      />

      {/* KPI Overview Grid - 2x2 on mobile, 4-col on desktop */}
      <PpKpiGrid className="grid-cols-2 lg:grid-cols-4">
        <PpKpiCard
          label={t('kpiActiveRules')}
          value={
            <span dir="ltr">
              {activeRulesCount} <span className="text-pp-headline-md text-pp-outline">/ {winRules.length}</span>
            </span>
          }
          accent="primary"
          badge={t('kpiActiveBadge', { count: activeRulesCount })}
          badgeAccent="primary"
          footer={t('kpiDefinedFooter', { count: winRules.length })}
        />
        <PpKpiCard
          label={t('kpiTrialPipeline')}
          value={
            <span dir="ltr">
              {trialPipelineView.status === 'ok' && trialPipelineView.conversionRatePct !== null
                ? `${trialPipelineView.conversionRatePct.toFixed(1)}%`
                : '—'}
            </span>
          }
          accent="mint"
          badge={trialPipelineView.status === 'ok' ? `${trialPipelineView.activeTrials} in trial` : undefined}
          badgeAccent="mint"
          footer={trialPipelineView.status === 'ok' ? t('kpiConvertingFooter') : t('kpiWarehouseFooter')}
        />
        <PpKpiCard
          label={t('kpiTopCloser')}
          value={
            <span dir="ltr">
              {topCloser ? `$${topCloser.totalAmount.toLocaleString(locale)}` : '—'}
            </span>
          }
          accent="amber"
          badge={topCloser ? topCloser.name : undefined}
          badgeAccent="amber"
          footer={topCloser ? t('kpiDealsClosedFooter', { count: topCloser.entryCount }) : t('kpiNoDealsFooter')}
        />
        <PpKpiCard
          label={t('kpiRecentWins')}
          value={<span dir="ltr">{recentWinEvents.length}</span>}
          valueSuffix={t('kpiWinsSuffix')}
          accent={recentWinEvents.length > 0 ? 'sky' : 'neutral'}
          badge={recentWinEvents.length > 0 ? t('kpiLoggedBadge') : undefined}
          badgeAccent="sky"
          footer={t('kpiPersistedFooter')}
        />
      </PpKpiGrid>

      {/* Main 2-Column Section */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left Column: Live Win Feed & Configured Rules */}
        <section className="flex flex-col gap-6 lg:col-span-7">
          {/* Live Win Stream & Persisted History */}
          <PpCard
            title={t('feedHeading')}
            subtitle={t('feedSubtitle')}
            icon={Sparkles}
            iconAccent="mint"
            action={
              <PpPill accent="mint" dot>
                Live
              </PpPill>
            }
          >
            <div className="space-y-6">
              <LiveWinFeed orgId={orgId} projectId={projectId} />
              <div className="border-t border-pp-outline-variant/30 pt-4">
                <WinEventHistoryList events={winEventHistoryViews} />
              </div>
            </div>
          </PpCard>

          {/* Active Rules List */}
          <PpCard
            title={t('rulesHeading')}
            subtitle={t('rulesSubtitle')}
            icon={Sliders}
            iconAccent="primary"
            action={<PpPill accent="primary">{winRuleViews.length} rules</PpPill>}
          >
            <WinRuleList orgId={orgId} projectId={projectId} winRules={winRuleViews} />
          </PpCard>
        </section>

        {/* Right Column: Rule Builder & Associated Widgets */}
        <section className="flex flex-col gap-6 lg:col-span-5">
          {/* Rule Builder */}
          <div id="rule-builder">
            <PpCard
              title={t('createHeading')}
              subtitle={t('createSubtitle')}
              icon={Plus}
              iconAccent="primary"
            >
              {eventSchemaNames.length === 0 ? (
                <p className="text-xs text-pp-outline">{t('noEventSchemas')}</p>
              ) : (
                <CreateWinRuleForm
                  orgId={orgId}
                  projectId={projectId}
                  eventSchemaNames={eventSchemaNames}
                />
              )}
            </PpCard>
          </div>

          {/* Trial Pipeline Widget */}
          <PpCard
            title={t('pipelineHeading')}
            subtitle={t('pipelineSubtitle')}
            icon={TrendingUp}
            iconAccent="mint"
          >
            <TrialPipelineWidget view={trialPipelineView} />
          </PpCard>

          {/* Sprint Leaderboard Widget */}
          <PpCard
            title={t('leaderboardCardHeading')}
            subtitle={t('leaderboardSubtitle')}
            icon={Trophy}
            iconAccent="amber"
          >
            <RepCollectionLeaderboardWidget view={repCollectionLeaderboardView} />
          </PpCard>
        </section>
      </div>

      {/* Mobile Sticky Action Bar */}
      <PpMobileActionBar>
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-xs font-medium text-pp-on-surface-variant">
            {t('activeRulesCount', { count: activeRulesCount })}
          </span>
          <PpButton variant="primary" size="sm" icon={Plus} asChild>
            <a href="#rule-builder">
              <span>{t('createHeading')}</span>
            </a>
          </PpButton>
        </div>
      </PpMobileActionBar>
    </PpPage>
  );
}
