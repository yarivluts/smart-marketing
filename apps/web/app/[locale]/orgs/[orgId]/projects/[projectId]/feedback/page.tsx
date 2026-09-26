import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BarChart3, CalendarRange, DatabaseZap, Info, Layers, MessageSquareHeart, MessageSquareQuote, PieChart, Smile, ThumbsDown, ThumbsUp, Users } from 'lucide-react';
import { can } from '@growthos/shared';
import { DEFAULT_NPS_OVERVIEW_RECORD_LIMIT, FEEDBACK_PACK_PLUGIN_ID, type NpsBreakdownDimension } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  builtinMetricPacks,
  getFeedbackThemeDigestForProject,
  getNpsDimensionBreakdownForProject,
  getNpsOverviewForProject,
  listOrgProjects,
  listPluginInstallsForProject,
  listSurveyResponseRecordsForProject,
} from '@/lib/orgs/queries';
import { hasActiveInstall, toPluginInstallView } from '@/lib/orgs/plugin-view';
import { feedbackThemeLabelKey, toNpsDimensionBreakdownRows, toNpsTrendChartRows } from '@/lib/orgs/feedback-view';
import { PackSetupLanding } from '@/components/orgs/pack-setup-landing';
import { StatCard } from '@/components/ui/stat-card';
import { BarList, ChartCard, DonutChart, EmptyState, PageHero, TrendChart } from '@/components/viz';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Feedback' });
  return { title: t('metaTitle') };
}

/** The shared read's cap. Named from the service's own default so the page and the service cannot drift to different numbers while both call it "the limit". */
const FEEDBACK_RECORD_LIMIT = DEFAULT_NPS_OVERVIEW_RECORD_LIMIT;

const DIMENSIONS: readonly { key: NpsBreakdownDimension; headingKey: string; emptyKey: string }[] = [
  { key: 'plan_interval', headingKey: 'byPlanHeading', emptyKey: 'byPlanEmpty' },
  { key: 'channel_id', headingKey: 'byChannelHeading', emptyKey: 'byChannelEmpty' },
  { key: 'cohort_month', headingKey: 'byCohortHeading', emptyKey: 'byCohortEmpty' },
];

/**
 * A project's NPS score, trend, and "top complaint this month" theme digest
 * (KAN-82, plan `14 §Gap 1`). Gated on `ingest.write`, same "whole feature,
 * not just mutation, is admin-only" posture as the sibling billing-ops-feed/
 * ingest-health pages — this reads landed `survey_response` raw records the
 * same way those pages read their own event schemas. Before the Feedback &
 * NPS pack is installed (no `survey_response` schema/metrics registered
 * yet), this page shows the same one-click install card the Plugins page
 * offers rather than an empty dashboard — reusing `InstallBuiltinPackSection`
 * exactly, no separate install UI. Theme clustering is a deterministic
 * keyword heuristic (`clusterFeedbackThemes`), a buildable-today stand-in
 * for a real LLM call, same posture KAN-55 established. The plan/channel/
 * cohort breakdown (KAN-82 follow-up) is the one section that reads the
 * warehouse-backed `fact_survey_response` mart via the metrics compiler,
 * degrading per-dimension (not blanking the whole page) the same way the
 * Churn Reasons page's own breakdown section does (`ChurnReasonsPage`,
 * KAN-84).
 */
export default async function FeedbackPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Ffeedback`);
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
  const packInstalled = hasActiveInstall(installViews, FEEDBACK_PACK_PLUGIN_ID);

  const t = await getTranslations('Feedback');

  if (!packInstalled) {
    const installablePacks = builtinMetricPacks().filter((pack) => pack.pluginId === FEEDBACK_PACK_PLUGIN_ID);
    return (
      <PackSetupLanding
        orgId={orgId}
        projectId={projectId}
        icon={MessageSquareHeart}
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        intro={t('setupIntro')}
        featuresTitle={t('setupFeaturesTitle')}
        installTitle={t('setupInstallTitle')}
        packs={installablePacks}
        features={[
          { key: 'nps', icon: PieChart, title: t('setupFeatureNpsTitle'), description: t('setupFeatureNpsDescription') },
          { key: 'trend', icon: CalendarRange, title: t('setupFeatureTrendTitle'), description: t('setupFeatureTrendDescription') },
          { key: 'themes', icon: MessageSquareQuote, title: t('setupFeatureThemesTitle'), description: t('setupFeatureThemesDescription') },
        ]}
      />
    );
  }

  // One read shared by both consumers (that is why `precomputedRecords` exists),
  // over-fetched by one so the cap is measured here rather than guessed by
  // either of them. `length === cap` cannot tell "exactly this many exist" from
  // "far more exist" (KAN-167).
  const fetchedRecords = await listSurveyResponseRecordsForProject(orgId, projectId, FEEDBACK_RECORD_LIMIT + 1);
  const sampledFrom = fetchedRecords.length > FEEDBACK_RECORD_LIMIT ? FEEDBACK_RECORD_LIMIT : null;
  const surveyResponseRecords = fetchedRecords.slice(0, FEEDBACK_RECORD_LIMIT);

  const [overview, themeDigest, dimensionOutcomes] = await Promise.all([
    getNpsOverviewForProject(orgId, projectId, { precomputedRecords: surveyResponseRecords, sampledFrom }),
    getFeedbackThemeDigestForProject(orgId, projectId, { precomputedRecords: surveyResponseRecords }),
    Promise.all(DIMENSIONS.map((dimension) => getNpsDimensionBreakdownForProject(orgId, projectId, dimension.key))),
  ]);

  const numberFormat = new Intl.NumberFormat(locale);
  const dayFormat = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const formatDay = (date: string) => dayFormat.format(new Date(`${date}T00:00:00Z`));
  const { overall } = overview;
  const hasResponses = overall.totalResponses > 0;
  const shareOf = (count: number) => (hasResponses ? Math.round((count / overall.totalResponses) * 100) : null);
  const promoterShare = shareOf(overall.promoters);
  const detractorShare = shareOf(overall.detractors);
  const trendRows = toNpsTrendChartRows(overview.dailyTrend, overview.trendReliableFrom, formatDay);

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={MessageSquareHeart} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('description')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('npsHeading')} value={hasResponses && overall.npsScore !== null ? numberFormat.format(overall.npsScore) : t('kpiNoValue')} icon={Smile} />
          <StatCard title={t('kpiResponses')} value={hasResponses ? numberFormat.format(overall.totalResponses) : t('kpiNoValue')} icon={Users} />
          <StatCard
            title={t('kpiPromoters')}
            value={promoterShare !== null ? t('kpiPercent', { percent: promoterShare }) : t('kpiNoValue')}
            progress={promoterShare ?? undefined}
            icon={ThumbsUp}
          />
          <StatCard
            title={t('kpiDetractors')}
            value={detractorShare !== null ? t('kpiPercent', { percent: detractorShare }) : t('kpiNoValue')}
            progress={detractorShare ?? undefined}
            icon={ThumbsDown}
          />
        </div>
      </PageHero>

      {sampledFrom !== null ? (
        <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          {t('sampledNotice', { limit: sampledFrom })}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <ChartCard title={t('sentimentHeading')} description={t('sentimentDescription')} icon={PieChart} className="lg:col-span-2" fill>
          {!hasResponses ? (
            <EmptyState icon={MessageSquareHeart} title={t('npsEmpty')} description={t('npsEmptyDetail')} compact />
          ) : (
            <div className="flex flex-col gap-3">
              <DonutChart
                label={t('sentimentHeading')}
                layout="stacked"
                centerValue={overall.npsScore !== null ? numberFormat.format(overall.npsScore) : undefined}
                centerLabel={t('npsCenterLabel')}
                data={[
                  { label: t('promotersLabel'), value: overall.promoters, color: 'hsl(var(--success))' },
                  { label: t('passivesLabel'), value: overall.passives, color: 'hsl(var(--muted-foreground) / 0.5)' },
                  { label: t('detractorsLabel'), value: overall.detractors, color: 'hsl(var(--destructive))' },
                ]}
              />
              <p className="text-xs text-muted-foreground">
                {t('npsBreakdownLine', { promoters: overall.promoters, passives: overall.passives, detractors: overall.detractors, total: overall.totalResponses })}
              </p>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title={t('trendSparklineLabel')}
          description={t('trendDescription', { days: overview.dailyTrend.length })}
          icon={CalendarRange}
          className="lg:col-span-3"
          fill
          footer={overview.trendReliableFrom !== null ? t('trendTruncatedNotice', { from: overview.trendReliableFrom, limit: overview.sampledFrom ?? 0 }) : undefined}
        >
          {/* A day before `trendReliableFrom` is a day the read never reached,
              which is not the same as a day nobody answered - those rows are
              null, so the chart leaves a gap instead of a false zero (KAN-167). */}
          {!hasResponses ? (
            <EmptyState icon={CalendarRange} title={t('trendEmpty')} compact />
          ) : (
            <TrendChart
              label={t('trendSparklineLabel')}
              xKey="day"
              kind="bar"
              stacked
              data={trendRows}
              series={[
                { key: 'promoters', label: t('promotersLabel'), color: 'hsl(var(--success))' },
                { key: 'passives', label: t('passivesLabel'), color: 'hsl(var(--muted-foreground) / 0.5)' },
                { key: 'detractors', label: t('detractorsLabel'), color: 'hsl(var(--destructive))' },
              ]}
              height={280}
            />
          )}
        </ChartCard>
      </div>

      <ChartCard title={t('themeDigestHeading')} description={t('themeDigestDescription')} icon={MessageSquareQuote}>
        {themeDigest.length === 0 ? (
          <EmptyState icon={MessageSquareQuote} title={t('themeDigestEmpty')} compact />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <BarList
              items={themeDigest.map((cluster) => ({ key: cluster.theme, label: t(feedbackThemeLabelKey(cluster.theme)), value: cluster.commentCount }))}
              valueFormatter={(count) => t('themeCommentCount', { count })}
              color="hsl(var(--warning))"
            />
            <ul className="flex flex-col gap-3">
              {themeDigest.flatMap((cluster) =>
                cluster.exampleComments.slice(0, 2).map((comment, index) => (
                  <li key={`${cluster.theme}-${index}`} className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
                    <p className="text-foreground">{t('themeExampleComment', { comment })}</p>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">{t(feedbackThemeLabelKey(cluster.theme))}</p>
                  </li>
                )),
              )}
            </ul>
          </div>
        )}
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-3">
        {DIMENSIONS.map((dimension, index) => {
          const outcome = dimensionOutcomes[index];
          const rows = outcome.ok ? toNpsDimensionBreakdownRows(outcome.rows, dimension.key) : [];
          return (
            <ChartCard key={dimension.key} title={t(dimension.headingKey)} description={t('dimensionDescription')} icon={dimension.key === 'cohort_month' ? Layers : BarChart3} fill>
              {rows.length === 0 ? (
                <EmptyState icon={DatabaseZap} title={t(dimension.emptyKey)} compact />
              ) : (
                <BarList
                  items={rows.map((row) => ({
                    key: row.value || '__unknown__',
                    label: row.value || t('dimensionValueUnknown'),
                    sublabel: row.npsScore === null ? t('dimensionScoreUnavailable') : t('dimensionScoreLine', { score: row.npsScore, respondents: row.respondents }),
                    value: row.respondents,
                  }))}
                  valueFormatter={(count) => t('dimensionRespondents', { count })}
                  maxItems={8}
                  moreLabel={(hidden) => t('dimensionMore', { count: hidden })}
                  color="hsl(var(--info))"
                />
              )}
            </ChartCard>
          );
        })}
      </div>
    </main>
  );
}
