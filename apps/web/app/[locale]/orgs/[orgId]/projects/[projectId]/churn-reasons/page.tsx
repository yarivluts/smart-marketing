import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BarChart3, CalendarRange, DatabaseZap, Layers, MessageSquareQuote, PieChart, Quote, Tags, TrendingDown, UserMinus } from 'lucide-react';
import { can } from '@growthos/shared';
import {
  CHURN_REASON_PACK_PLUGIN_ID,
  DEFAULT_CANCELLATION_REASON_RECORD_LIMIT,
  type CancellationReasonBreakdownDimension,
} from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  builtinMetricPacks,
  getCancellationReasonCodeBreakdownForProject,
  getCancellationReasonDimensionBreakdownForProject,
  getCancellationReasonThemeDigestForProject,
  listCancellationReasonRecordsForProject,
  listOrgProjects,
  listPluginInstallsForProject,
} from '@/lib/orgs/queries';
import { hasActiveInstall, toPluginInstallView } from '@/lib/orgs/plugin-view';
import {
  cancellationReasonCodeLabelKey,
  cancellationReasonThemeLabelKey,
  toCancellationReasonDimensionBreakdownRows,
  toCancellationTrend,
} from '@/lib/orgs/churn-reason-view';
import { PackSetupLanding } from '@/components/orgs/pack-setup-landing';
import { ThemeDigestGrid } from '@/components/orgs/theme-digest-grid';
import { StatCard } from '@/components/ui/stat-card';
import { BarList, ChartCard, DonutChart, EmptyState, PageHero, TrendChart } from '@/components/viz';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ChurnReasons' });
  return { title: t('metaTitle') };
}

const DIMENSIONS: readonly { key: CancellationReasonBreakdownDimension; headingKey: string; emptyKey: string }[] = [
  { key: 'plan_interval', headingKey: 'byPlanHeading', emptyKey: 'byPlanEmpty' },
  { key: 'channel_id', headingKey: 'byChannelHeading', emptyKey: 'byChannelEmpty' },
  { key: 'cohort_month', headingKey: 'byCohortHeading', emptyKey: 'byCohortEmpty' },
];

/** Weeks of history the cancellations-per-week chart covers. */
const TREND_WEEKS = 12;

/**
 * A project's structured + free-text churn-reason breakdown (KAN-84, plan
 * `14 §Gap 10`) — mirrors the Feedback & NPS page's own shape exactly (same
 * gating, same install-card-until-installed posture, KAN-82). The
 * structured `reason_code` breakdown and free-text theme digest are
 * computed fresh from bounded Firestore reads (no warehouse needed, same
 * posture `getNpsOverviewForProject`/`getFeedbackThemeDigestForProject`
 * take); the plan/channel/cohort breakdown is the one section that reads
 * the warehouse-backed `fact_cancellation_reason` mart via the metrics
 * compiler, degrading per-dimension (not blanking the whole page) the same
 * way a board tile degrades when the warehouse isn't configured yet
 * (`queryBoardTile`, KAN-60).
 *
 * The weekly trend is bucketed from the same bounded read as the reason
 * donut (`toCancellationTrend`), so the two always add up to the same total.
 */
export default async function ChurnReasonsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fchurn-reasons`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId, projectId })) {
    notFound();
  }

  const [projects, installs] = await Promise.all([listOrgProjects(orgId), listPluginInstallsForProject(orgId, projectId)]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const installViews = installs.map(toPluginInstallView);
  const packInstalled = hasActiveInstall(installViews, CHURN_REASON_PACK_PLUGIN_ID);

  const t = await getTranslations('ChurnReasons');

  if (!packInstalled) {
    const installablePacks = builtinMetricPacks().filter((pack) => pack.pluginId === CHURN_REASON_PACK_PLUGIN_ID);
    return (
      <PackSetupLanding
        orgId={orgId}
        projectId={projectId}
        icon={UserMinus}
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        intro={t('setupIntro')}
        featuresTitle={t('setupFeaturesTitle')}
        installTitle={t('setupInstallTitle')}
        packs={installablePacks}
        features={[
          { key: 'reasons', icon: PieChart, title: t('setupFeatureReasonsTitle'), description: t('setupFeatureReasonsDescription') },
          { key: 'trend', icon: TrendingDown, title: t('setupFeatureTrendTitle'), description: t('setupFeatureTrendDescription') },
          { key: 'themes', icon: MessageSquareQuote, title: t('setupFeatureThemesTitle'), description: t('setupFeatureThemesDescription') },
        ]}
      />
    );
  }

  const cancellationRecords = await listCancellationReasonRecordsForProject(orgId, projectId);
  const [codeBreakdown, themeDigest, dimensionOutcomes] = await Promise.all([
    getCancellationReasonCodeBreakdownForProject(orgId, projectId, { precomputedRecords: cancellationRecords }),
    getCancellationReasonThemeDigestForProject(orgId, projectId, { precomputedRecords: cancellationRecords }),
    Promise.all(DIMENSIONS.map((dimension) => getCancellationReasonDimensionBreakdownForProject(orgId, projectId, dimension.key))),
  ]);

  const numberFormat = new Intl.NumberFormat(locale);
  const weekFormat = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const dayFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
  const totalCancellations = codeBreakdown.reduce((sum, entry) => sum + entry.count, 0);
  const topReason = codeBreakdown[0] ?? null;
  const themeCoverage = themeDigest.totalComments > 0 ? Math.round((themeDigest.matchedComments / themeDigest.totalComments) * 100) : null;
  const trend = toCancellationTrend(cancellationRecords, { now: new Date(), weeks: TREND_WEEKS, cap: DEFAULT_CANCELLATION_REASON_RECORD_LIMIT });
  const countLabel = (count: number) => t('reasonCodeCount', { count });

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={UserMinus} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('description')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiCancellations')} value={totalCancellations > 0 ? numberFormat.format(totalCancellations) : t('kpiNoValue')} icon={UserMinus} />
          <StatCard
            title={t('kpiTopReason')}
            value={topReason ? t(cancellationReasonCodeLabelKey(topReason.reasonCode)) : t('kpiNoValue')}
            subtext={topReason ? t('kpiTopReasonShare', { percent: Math.round((topReason.count / totalCancellations) * 100) }) : undefined}
            icon={Tags}
          />
          <StatCard title={t('kpiComments')} value={themeDigest.totalComments > 0 ? numberFormat.format(themeDigest.totalComments) : t('kpiNoValue')} icon={MessageSquareQuote} />
          <StatCard
            title={t('kpiThemeCoverage')}
            value={themeCoverage !== null ? t('kpiPercent', { percent: themeCoverage }) : t('kpiNoValue')}
            progress={themeCoverage ?? undefined}
            icon={Quote}
          />
        </div>
      </PageHero>

      {codeBreakdown.length === 0 ? (
        <EmptyState icon={UserMinus} title={t('reasonCodeEmpty')} description={t('reasonCodeEmptyDetail')} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <ChartCard title={t('reasonCodeHeading')} description={t('reasonCodeDescription')} icon={PieChart} className="lg:col-span-2" fill>
            <DonutChart
              label={t('reasonCodeHeading')}
              layout="stacked"
              centerValue={numberFormat.format(totalCancellations)}
              centerLabel={t('reasonCodeCenterLabel')}
              data={codeBreakdown.map((entry) => ({ label: t(cancellationReasonCodeLabelKey(entry.reasonCode)), value: entry.count }))}
            />
          </ChartCard>
          <ChartCard
            title={t('trendTitle')}
            description={t('trendDescription', { weeks: TREND_WEEKS })}
            icon={CalendarRange}
            className="lg:col-span-3"
            fill
            footer={trend.reliableFrom ? t('trendPartialNotice', { from: dayFormat.format(new Date(trend.reliableFrom)), limit: DEFAULT_CANCELLATION_REASON_RECORD_LIMIT }) : undefined}
          >
            <TrendChart
              label={t('trendTitle')}
              xKey="week"
              kind="bar"
              data={trend.buckets.map((bucket) => ({ week: weekFormat.format(new Date(bucket.start)), cancellations: bucket.count }))}
              series={[{ key: 'cancellations', label: t('trendSeries'), color: 'hsl(var(--destructive))' }]}
              height={340}
            />
          </ChartCard>
        </div>
      )}

      <ChartCard
        title={t('themeDigestHeading')}
        description={t('themeDigestDescription')}
        icon={MessageSquareQuote}
        footer={
          themeDigest.uncategorizedComments > 0 && themeDigest.clusters.length > 0
            ? t('themeDigestCoverage', { matched: themeDigest.matchedComments, total: themeDigest.totalComments })
            : undefined
        }
      >
        {themeDigest.totalComments === 0 ? (
          <EmptyState icon={MessageSquareQuote} title={t('themeDigestEmpty')} compact />
        ) : themeDigest.clusters.length === 0 ? (
          // Distinct from "nothing landed": comments DID arrive and the fixed
          // English keyword lexicon matched none of them. Rendering the same
          // "no comments landed yet" line for both told a project whose
          // customers write in another language that nobody had commented.
          <EmptyState icon={MessageSquareQuote} title={t('themeDigestNoneMatched', { count: themeDigest.totalComments })} compact />
        ) : (
          <ThemeDigestGrid
            items={themeDigest.clusters.map((cluster) => ({
              key: cluster.theme,
              label: t(cancellationReasonThemeLabelKey(cluster.theme)),
              count: cluster.commentCount,
              countLabel: t('themeCommentCount', { count: cluster.commentCount }),
              quotes: cluster.exampleComments.map((comment) => t('themeExampleComment', { comment })),
            }))}
          />
        )}
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-3">
        {DIMENSIONS.map((dimension, index) => {
          const outcome = dimensionOutcomes[index];
          const rows = outcome.ok ? toCancellationReasonDimensionBreakdownRows(outcome.rows, dimension.key) : [];
          return (
            <ChartCard key={dimension.key} title={t(dimension.headingKey)} description={t('dimensionDescription')} icon={dimension.key === 'cohort_month' ? Layers : BarChart3} fill>
              {rows.length === 0 ? (
                <EmptyState icon={DatabaseZap} title={t(dimension.emptyKey)} compact />
              ) : (
                <BarList
                  items={rows.map((row) => ({ key: row.value || '__unknown__', label: row.value || t('dimensionValueUnknown'), value: row.count }))}
                  valueFormatter={countLabel}
                  maxItems={8}
                  moreLabel={(hidden) => t('dimensionMore', { count: hidden })}
                  color="hsl(var(--destructive))"
                />
              )}
            </ChartCard>
          );
        })}
      </div>
    </main>
  );
}
