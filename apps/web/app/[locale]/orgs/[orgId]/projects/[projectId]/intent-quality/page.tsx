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
import { PpPage, PpPageHeader, PpCard, PpKpiCard, PpKpiGrid, PpEmptyState, PpPill, PpTable } from '@/components/pastel/primitives';
import { Sparkles, Gauge, AlertTriangle, Layers, Calendar, Database } from 'lucide-react';

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
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/intent-quality`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const installViews = installs.map(toPluginInstallView);
  const packInstalled = hasActiveInstall(installViews, QUALITY_SCORE_PACK_PLUGIN_ID);

  const t = await getTranslations('IntentQuality');

  if (!packInstalled) {
    const installablePacks = builtinMetricPacks().filter((pack) => pack.pluginId === QUALITY_SCORE_PACK_PLUGIN_ID);
    return (
      <PpPage>
        <PpPageHeader
          eyebrow="CALIBRATION ENGINE"
          meta={project.name}
          title={t('title', { projectName: project.name })}
          description={t('setupIntro')}
        />
        <PpCard>
          <InstallBuiltinPackSection orgId={orgId} projectId={projectId} packs={installablePacks} />
        </PpCard>
      </PpPage>
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

  const total = distribution.totalResponses;
  const avg = distribution.averageScore !== null ? Math.round(distribution.averageScore) : null;
  const avgAccent = avg === null ? 'neutral' : avg >= 70 ? 'mint' : avg >= 40 ? 'amber' : 'error';

  return (
    <PpPage>
      <PpPageHeader
        eyebrow="CALIBRATION ENGINE"
        meta={total > 0 ? `${total} responses` : undefined}
        title={t('title', { projectName: project.name })}
        description={t('description')}
      />

      <PpKpiGrid>
        <PpKpiCard
          label={t('averageScoreLabel')}
          value={avg !== null ? avg : '—'}
          valueSuffix={avg !== null ? '/ 100' : undefined}
          accent={avgAccent}
          footer={
            total === 0
              ? t('distributionEmpty')
              : t('distributionAverage', { average: avg ?? 0, count: total })
          }
        />
        <PpKpiCard
          label={t('totalResponsesLabel')}
          value={total === 0 ? '—' : total}
          accent="mint"
          footer="Onboarding survey answers"
        />
        <PpKpiCard
          label={t('qualityAdjustedCostPerSignupLabel')}
          value={
            adjustedMetrics.ok && adjustedMetrics.metrics.costPerSignup !== null
              ? `$${adjustedMetrics.metrics.costPerSignup.toFixed(2)}`
              : '—'
          }
          accent="sky"
          footer={adjustedMetrics.ok ? 'Quality-weighted cost' : t('adjustedMetricsEmpty')}
        />
        <PpKpiCard
          label={t('qualityAdjustedCacLabel')}
          value={
            adjustedMetrics.ok && adjustedMetrics.metrics.cac !== null
              ? `$${adjustedMetrics.metrics.cac.toFixed(2)}`
              : '—'
          }
          accent="amber"
          footer={adjustedMetrics.ok ? 'Quality-weighted CAC' : t('adjustedMetricsEmpty')}
        />
      </PpKpiGrid>

      <PpCard
        icon={Gauge}
        iconAccent="primary"
        title={t('distributionHeading')}
        subtitle={
          total > 0
            ? t('distributionAverage', { average: avg ?? 0, count: total })
            : undefined
        }
      >
        {total === 0 ? (
          <PpEmptyState
            icon={Gauge}
            title={t('distributionHeading')}
            description={t('distributionEmpty')}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-pp-md">
            {(['high', 'medium', 'low'] as const).map((tier) => {
              const count = distribution[tier];
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const accent = tier === 'high' ? 'mint' : tier === 'medium' ? 'amber' : 'pink';
              return (
                <div
                  key={tier}
                  className="rounded-2xl border border-pp-outline-variant/30 bg-pp-surface-container-low/40 p-pp-lg flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-pp-display text-pp-headline-sm font-semibold text-pp-on-surface">
                      {t(signupQualityScoreTierLabelKey(tier))}
                    </span>
                    <PpPill accent={accent}>{pct}%</PpPill>
                  </div>
                  <div>
                    <div className="font-pp-display text-pp-metric text-pp-on-surface">
                      {count}
                    </div>
                    <p className="text-pp-body-sm text-pp-on-surface-variant">
                      {t('distributionCount', { count })}
                    </p>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-pp-surface-container">
                    <div
                      className="h-full rounded-full bg-pp-primary transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PpCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-pp-lg">
        {DIMENSIONS.map((dimension, index) => {
          const outcome = dimensionOutcomes[index];
          const rows = outcome.ok ? toSignupQualityScoreDimensionBreakdownRows(outcome.rows, dimension.key) : [];
          return (
            <PpCard
              key={dimension.key}
              icon={dimension.key === 'channel_id' ? Layers : Calendar}
              iconAccent={dimension.key === 'channel_id' ? 'primary' : 'mint'}
              title={t(dimension.headingKey)}
              flush={outcome.ok && rows.length > 0}
            >
              {!outcome.ok || rows.length === 0 ? (
                <PpEmptyState
                  icon={Database}
                  title={t(dimension.headingKey)}
                  description={t(dimension.emptyKey)}
                />
              ) : (
                <PpTable>
                  <thead>
                    <tr>
                      <th>Segment</th>
                      <th className="text-end">Avg Quality</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.value}>
                        <td className="font-medium text-pp-on-surface">{row.value || t('dimensionValueUnknown')}</td>
                        <td className="text-end">
                          {row.averageScore !== null ? (
                            <PpPill accent={row.averageScore >= 70 ? 'mint' : row.averageScore >= 40 ? 'amber' : 'pink'}>
                              {t('dimensionAverageScore', { average: Math.round(row.averageScore), count: row.sampleSize })}
                            </PpPill>
                          ) : (
                            <span className="text-pp-outline">{t('dimensionValueUnknown')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </PpTable>
              )}
            </PpCard>
          );
        })}
      </div>

      <PpCard
        icon={AlertTriangle}
        iconAccent="amber"
        title={t('mixAlertsHeading')}
        action={<CheckQualityMixAlertsButton orgId={orgId} projectId={projectId} />}
      >
        {alertViews.length === 0 ? (
          <PpEmptyState
            icon={AlertTriangle}
            title={t('mixAlertsHeading')}
            description={t('mixAlertsEmpty')}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-pp-md">
            {alertViews.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-pp-outline-variant/30 bg-pp-surface-container-low/40 p-pp-md"
              >
                <div className="min-w-0">
                  <div className="font-pp-display text-pp-headline-sm font-semibold text-pp-on-surface">
                    {alert.channelId || t('dimensionValueUnknown')}
                  </div>
                  <div className="text-pp-body-sm text-pp-on-surface-variant mt-0.5">
                    {t('mixAlertDelta', {
                      baseline: Math.round(alert.baselineAvgScore),
                      current: Math.round(alert.currentAvgScore),
                    })}
                  </div>
                </div>
                <PpPill accent={alert.status === 'active' ? 'amber' : 'neutral'} dot>
                  {t(qualityMixAlertStatusLabelKey(alert.status))}
                </PpPill>
              </div>
            ))}
          </div>
        )}
      </PpCard>
    </PpPage>
  );
}
