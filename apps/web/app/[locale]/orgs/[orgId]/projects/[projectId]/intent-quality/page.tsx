import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { QUALITY_SCORE_PACK_PLUGIN_ID, type SignupQualityScoreBreakdownDimension } from '@growthos/firebase-orm-models';
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
import { qualityMixAlertStatusLabelKey, signupQualityScoreTierLabelKey, toQualityMixAlertView, toSignupQualityScoreDimensionBreakdownRows } from '@/lib/orgs/quality-score-view';
import { InstallBuiltinPackSection } from '@/components/orgs/install-builtin-pack-section';
import { CheckQualityMixAlertsButton } from '@/components/orgs/check-quality-mix-alerts-button';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'IntentQuality' });
  return { title: t('metaTitle') };
}

const DIMENSIONS: readonly { key: SignupQualityScoreBreakdownDimension; headingKey: string; emptyKey: string }[] = [
  { key: 'channel_id', headingKey: 'byChannelHeading', emptyKey: 'byChannelEmpty' },
  { key: 'cohort_month', headingKey: 'byCohortHeading', emptyKey: 'byCohortEmpty' },
];

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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId })) {
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
      <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
        <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
        <p className="text-sm text-muted-foreground">{t('setupIntro')}</p>
        <InstallBuiltinPackSection orgId={orgId} projectId={projectId} packs={installablePacks} />
      </main>
    );
  }

  const surveyRecords = await listOnboardingSurveyRecordsForProject(orgId, projectId);
  const [distribution, adjustedMetrics, alerts, dimensionOutcomes] = await Promise.all([
    getSignupQualityScoreOverviewForProject(orgId, projectId, { precomputedRecords: surveyRecords }),
    getSignupQualityScoreAdjustedMetricsForProject(orgId, projectId),
    listQualityMixAlertsForProject(orgId, projectId),
    Promise.all(DIMENSIONS.map((dimension) => getSignupQualityScoreDimensionBreakdownForProject(orgId, projectId, dimension.key))),
  ]);
  const alertViews = alerts.map(toQualityMixAlertView);

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('distributionHeading')}</h2>
        {distribution.totalResponses === 0 ? (
          <p className="text-muted-foreground">{t('distributionEmpty')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              {t('distributionAverage', { average: distribution.averageScore !== null ? Math.round(distribution.averageScore) : 0, count: distribution.totalResponses })}
            </p>
            <ul className="flex flex-col gap-1">
              {(['low', 'medium', 'high'] as const).map((tier) => (
                <li key={tier} className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2 text-sm">
                  <span>{t(signupQualityScoreTierLabelKey(tier))}</span>
                  <span className="text-muted-foreground">{t('distributionCount', { count: distribution[tier] })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('adjustedMetricsHeading')}</h2>
        {!adjustedMetrics.ok ? (
          <p className="text-muted-foreground">{t('adjustedMetricsEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            <li className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2 text-sm">
              <span>{t('qualityAdjustedCostPerSignupLabel')}</span>
              <span className="text-muted-foreground">
                {adjustedMetrics.metrics.costPerSignup !== null ? t('adjustedMetricsValue', { value: adjustedMetrics.metrics.costPerSignup.toFixed(2) }) : t('adjustedMetricsValueUnavailable')}
              </span>
            </li>
            <li className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2 text-sm">
              <span>{t('qualityAdjustedCacLabel')}</span>
              <span className="text-muted-foreground">
                {adjustedMetrics.metrics.cac !== null ? t('adjustedMetricsValue', { value: adjustedMetrics.metrics.cac.toFixed(2) }) : t('adjustedMetricsValueUnavailable')}
              </span>
            </li>
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{t('mixAlertsHeading')}</h2>
          <CheckQualityMixAlertsButton orgId={orgId} projectId={projectId} />
        </div>
        {alertViews.length === 0 ? (
          <p className="text-muted-foreground">{t('mixAlertsEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {alertViews.map((alert) => (
              <li key={alert.id} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{alert.channelId || t('dimensionValueUnknown')}</span>
                  <span className="text-xs text-muted-foreground">{t(qualityMixAlertStatusLabelKey(alert.status))}</span>
                </div>
                <span className="text-muted-foreground">
                  {t('mixAlertDelta', { baseline: Math.round(alert.baselineAvgScore), current: Math.round(alert.currentAvgScore) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {DIMENSIONS.map((dimension, index) => {
        const outcome = dimensionOutcomes[index];
        return (
          <section key={dimension.key} className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold tracking-tight">{t(dimension.headingKey)}</h2>
            {!outcome.ok ? (
              <p className="text-muted-foreground">{t(dimension.emptyKey)}</p>
            ) : (
              (() => {
                const rows = toSignupQualityScoreDimensionBreakdownRows(outcome.rows, dimension.key);
                return rows.length === 0 ? (
                  <p className="text-muted-foreground">{t(dimension.emptyKey)}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {rows.map((row) => (
                      <li key={row.value} className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2 text-sm">
                        <span>{row.value || t('dimensionValueUnknown')}</span>
                        <span className="text-muted-foreground">
                          {row.averageScore !== null ? t('dimensionAverageScore', { average: Math.round(row.averageScore), count: row.sampleSize }) : t('dimensionValueUnknown')}
                        </span>
                      </li>
                    ))}
                  </ul>
                );
              })()
            )}
          </section>
        );
      })}
    </main>
  );
}
