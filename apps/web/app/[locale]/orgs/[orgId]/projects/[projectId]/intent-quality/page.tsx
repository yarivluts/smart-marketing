import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BellRing, CalendarRange, DatabaseZap, Gauge, Radio, ShieldCheck, Sparkles, Target, Wallet } from 'lucide-react';
import { can } from '@growthos/shared';
import {
  DEFAULT_QUALITY_ADJUSTED_METRICS_WINDOW_DAYS,
  QUALITY_SCORE_PACK_PLUGIN_ID,
  type SignupQualityScoreBreakdownDimension,
} from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  builtinMetricPacks,
  getSignupQualityScoreAdjustedMetricsForProject,
  getSignupQualityScoreDimensionBreakdownForProject,
  getSignupQualityScoreOverviewForProject,
  listOnboardingSurveyRecordsForProject,
  listOrgProjects,
  listPluginInstallsForProject,
  listQualityMixAlertsForProject,
} from '@/lib/orgs/queries';
import { hasActiveInstall, toPluginInstallView } from '@/lib/orgs/plugin-view';
import {
  qualityMixAlertStatusLabelKey,
  signupQualityScoreTierLabelKey,
  toQualityMixAlertView,
  toQualityTierSlices,
  toSignupQualityScoreDimensionBreakdownRows,
} from '@/lib/orgs/quality-score-view';
import { PackSetupLanding } from '@/components/orgs/pack-setup-landing';
import { CheckQualityMixAlertsButton } from '@/components/orgs/check-quality-mix-alerts-button';
import { StatCard } from '@/components/ui/stat-card';
import { BarList, ChartCard, ComparisonBars, DonutChart, EmptyState, PageHero, TrendChart } from '@/components/viz';
import { cn } from '@/lib/utils';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'IntentQuality' });
  return { title: t('metaTitle') };
}

/** Read in this order: the channel breakdown feeds the calibration bars, the cohort one the trend line. */
const DIMENSIONS: readonly SignupQualityScoreBreakdownDimension[] = ['channel_id', 'cohort_month'];

/**
 * A project's signup-quality score distribution, quality-adjusted CAC/CPS,
 * channel/cohort breakdown, and mix-shift alert history (KAN-83, plan `14
 * §Gap 4`) — mirrors the Churn Reasons page's own shape exactly (same
 * gating, same install-card-until-installed posture, KAN-84). The score
 * distribution is computed fresh from bounded Firestore reads (no warehouse
 * needed, same posture `getCancellationReasonCodeBreakdownForProject`
 * takes); the quality-adjusted metrics and channel/cohort breakdown both
 * read the warehouse-backed `fact_signup_quality_score` mart via the
 * metrics compiler, degrading per-section (not blanking the whole page) the
 * same way a board tile degrades when the warehouse isn't configured yet.
 */
export default async function IntentQualityPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fintent-quality`);
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
  const packInstalled = hasActiveInstall(installViews, QUALITY_SCORE_PACK_PLUGIN_ID);

  const t = await getTranslations('IntentQuality');

  if (!packInstalled) {
    const installablePacks = builtinMetricPacks().filter((pack) => pack.pluginId === QUALITY_SCORE_PACK_PLUGIN_ID);
    return (
      <PackSetupLanding
        orgId={orgId}
        projectId={projectId}
        icon={Gauge}
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        intro={t('setupIntro')}
        featuresTitle={t('setupFeaturesTitle')}
        installTitle={t('setupInstallTitle')}
        packs={installablePacks}
        features={[
          { key: 'tiers', icon: Gauge, title: t('setupFeatureTiersTitle'), description: t('setupFeatureTiersDescription') },
          { key: 'channels', icon: Radio, title: t('setupFeatureChannelsTitle'), description: t('setupFeatureChannelsDescription') },
          { key: 'alerts', icon: BellRing, title: t('setupFeatureAlertsTitle'), description: t('setupFeatureAlertsDescription') },
        ]}
      />
    );
  }

  const surveyRecords = await listOnboardingSurveyRecordsForProject(orgId, projectId);
  const [distribution, adjustedMetrics, alerts, dimensionOutcomes] = await Promise.all([
    getSignupQualityScoreOverviewForProject(orgId, projectId, { precomputedRecords: surveyRecords }),
    getSignupQualityScoreAdjustedMetricsForProject(orgId, projectId),
    listQualityMixAlertsForProject(orgId, projectId),
    Promise.all(DIMENSIONS.map((dimension) => getSignupQualityScoreDimensionBreakdownForProject(orgId, projectId, dimension))),
  ]);
  const alertViews = alertsSortedActiveFirst(alerts.map(toQualityMixAlertView));
  const activeAlertCount = alertViews.filter((alert) => alert.status === 'active').length;

  const numberFormat = new Intl.NumberFormat(locale);
  const monthFormat = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const tierSlices = toQualityTierSlices(distribution);
  const highShare = distribution.totalResponses > 0 ? Math.round((distribution.high / distribution.totalResponses) * 100) : null;
  const averageScore = distribution.averageScore !== null ? Math.round(distribution.averageScore) : null;
  const [channelOutcome, cohortOutcome] = dimensionOutcomes;
  const channelRows = channelOutcome.ok ? toSignupQualityScoreDimensionBreakdownRows(channelOutcome.rows, 'channel_id') : [];
  const cohortRows = cohortOutcome.ok
    ? toSignupQualityScoreDimensionBreakdownRows(cohortOutcome.rows, 'cohort_month').sort((a, b) => a.value.localeCompare(b.value))
    : [];
  const cohortLabel = (value: string): string => {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? monthFormat.format(date) : value || t('dimensionValueUnknown');
  };

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={Gauge} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('description')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiScoredSignups')} value={distribution.totalResponses > 0 ? numberFormat.format(distribution.totalResponses) : t('kpiNoValue')} icon={Target} />
          <StatCard title={t('kpiAverageScore')} value={averageScore !== null ? numberFormat.format(averageScore) : t('kpiNoValue')} progress={averageScore ?? undefined} icon={Gauge} />
          <StatCard title={t('kpiHighShare')} value={highShare !== null ? t('kpiPercent', { percent: highShare }) : t('kpiNoValue')} progress={highShare ?? undefined} icon={Sparkles} />
          <StatCard title={t('kpiActiveAlerts')} value={numberFormat.format(activeAlertCount)} icon={BellRing} />
        </div>
      </PageHero>

      <div className="grid gap-6 lg:grid-cols-5">
        <ChartCard title={t('distributionHeading')} description={t('distributionDescription')} icon={Gauge} className="lg:col-span-2" fill>
          {distribution.totalResponses === 0 ? (
            <EmptyState icon={Gauge} title={t('distributionEmpty')} description={t('distributionEmptyDetail')} compact />
          ) : (
            <div className="flex flex-col gap-3">
              <DonutChart
                label={t('distributionHeading')}
                layout="stacked"
                centerValue={averageScore !== null ? numberFormat.format(averageScore) : undefined}
                centerLabel={t('distributionCenterLabel')}
                data={tierSlices.map((slice) => ({ label: t(signupQualityScoreTierLabelKey(slice.tier)), value: slice.count, color: slice.color }))}
              />
              <p className="text-xs text-muted-foreground">{t('distributionAverage', { average: averageScore ?? 0, count: distribution.totalResponses })}</p>
            </div>
          )}
        </ChartCard>

        <ChartCard title={t('byChannelHeading')} description={t('byChannelDescription')} icon={Radio} className="lg:col-span-3" fill>
          {channelRows.length === 0 ? (
            <EmptyState icon={DatabaseZap} title={t('byChannelEmpty')} compact />
          ) : (
            <BarList
              items={channelRows.map((row) => ({
                key: row.value || '__unknown__',
                label: row.value || t('dimensionValueUnknown'),
                sublabel: t('distributionCount', { count: row.sampleSize }),
                value: row.averageScore ?? 0,
              }))}
              valueFormatter={(value) => t('scoreValue', { score: Math.round(value) })}
              maxItems={8}
              moreLabel={(hidden) => t('dimensionMore', { count: hidden })}
            />
          )}
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title={t('adjustedMetricsHeading')} icon={Wallet} footer={t('adjustedMetricsWindowNote', { days: DEFAULT_QUALITY_ADJUSTED_METRICS_WINDOW_DAYS })} fill>
          {/* A CAC with no period attached is not interpretable — 90 days is a
              choice this code makes, and the reader has no way to know it. The
              quality weighting is stated for the same reason: "quality-adjusted"
              names the adjustment without saying what it does (KAN-169). */}
          {!adjustedMetrics.ok ? (
            <EmptyState icon={DatabaseZap} title={t('adjustedMetricsEmpty')} compact />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard
                title={t('qualityAdjustedCostPerSignupLabel')}
                value={
                  adjustedMetrics.metrics.costPerSignup !== null
                    ? t('adjustedMetricsValue', { value: adjustedMetrics.metrics.costPerSignup.toFixed(2) })
                    : t('adjustedMetricsValueUnavailable')
                }
                icon={Wallet}
              />
              <StatCard
                title={t('qualityAdjustedCacLabel')}
                value={adjustedMetrics.metrics.cac !== null ? t('adjustedMetricsValue', { value: adjustedMetrics.metrics.cac.toFixed(2) }) : t('adjustedMetricsValueUnavailable')}
                icon={ShieldCheck}
              />
            </div>
          )}
        </ChartCard>

        <ChartCard
          title={t('mixAlertsHeading')}
          description={t('mixAlertsDescription')}
          icon={BellRing}
          actions={<CheckQualityMixAlertsButton orgId={orgId} projectId={projectId} />}
          fill
        >
          {alertViews.length === 0 ? (
            <EmptyState icon={BellRing} title={t('mixAlertsEmpty')} compact />
          ) : (
            <ul className="flex flex-col gap-3">
              {alertViews.map((alert) => (
                <li key={alert.id} className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium text-foreground">{alert.channelId || t('dimensionValueUnknown')}</span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                        alert.status === 'active' ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {t(qualityMixAlertStatusLabelKey(alert.status))}
                    </span>
                  </div>
                  <ComparisonBars
                    label={t('mixAlertDelta', { baseline: Math.round(alert.baselineAvgScore), current: Math.round(alert.currentAvgScore) })}
                    max={100}
                    bars={[
                      {
                        key: 'baseline',
                        label: t('mixAlertBaselineLabel'),
                        value: alert.baselineAvgScore,
                        display: t('scoreValue', { score: Math.round(alert.baselineAvgScore) }),
                        color: 'hsl(var(--muted-foreground) / 0.45)',
                      },
                      {
                        key: 'current',
                        label: t('mixAlertCurrentLabel'),
                        value: alert.currentAvgScore,
                        display: t('scoreValue', { score: Math.round(alert.currentAvgScore) }),
                        color: alert.currentAvgScore < alert.baselineAvgScore ? 'hsl(var(--warning))' : 'hsl(var(--success))',
                      },
                    ]}
                  />
                  <span className="text-xs text-muted-foreground">
                    {t('mixAlertDelta', { baseline: Math.round(alert.baselineAvgScore), current: Math.round(alert.currentAvgScore) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>

      <ChartCard title={t('byCohortHeading')} description={t('byCohortDescription')} icon={CalendarRange}>
        {cohortRows.length === 0 ? (
          <EmptyState icon={DatabaseZap} title={t('byCohortEmpty')} compact />
        ) : (
          <TrendChart
            label={t('byCohortHeading')}
            xKey="cohort"
            kind="line"
            data={cohortRows.map((row) => ({ cohort: cohortLabel(row.value), score: row.averageScore === null ? null : Math.round(row.averageScore) }))}
            series={[{ key: 'score', label: t('byCohortSeries') }]}
          />
        )}
      </ChartCard>
    </main>
  );
}

function alertsSortedActiveFirst<T extends { status: string }>(alerts: T[]): T[] {
  return [...alerts].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'));
}
