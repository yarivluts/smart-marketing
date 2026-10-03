import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { FEEDBACK_PACK_PLUGIN_ID, type NpsBreakdownDimension } from '@growthos/firebase-orm-models';
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
import { feedbackThemeLabelKey, toNpsDimensionBreakdownRows } from '@/lib/orgs/feedback-view';
import { InstallBuiltinPackSection } from '@/components/orgs/install-builtin-pack-section';
import { PpPage, PpPageHeader, PpCard, PpKpiCard, PpKpiGrid, PpEmptyState, PpPill, PpTable } from '@/components/pastel/primitives';
import { MessageSquare, Sparkles, Database, Layers } from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Feedback' });
  return { title: t('metaTitle') };
}

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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId })) {
    notFound();
  }

  const [projects, installs] = await Promise.all([listOrgProjects(orgId), listPluginInstallsForProject(orgId, projectId)]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/feedback`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const installViews = installs.map(toPluginInstallView);
  const packInstalled = hasActiveInstall(installViews, FEEDBACK_PACK_PLUGIN_ID);

  const t = await getTranslations('Feedback');

  if (!packInstalled) {
    const installablePacks = builtinMetricPacks().filter((pack) => pack.pluginId === FEEDBACK_PACK_PLUGIN_ID);
    return (
      <PpPage>
        <PpPageHeader
          eyebrow="VOICE OF CUSTOMER"
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

  const surveyResponseRecords = await listSurveyResponseRecordsForProject(orgId, projectId);
  const [overview, themeDigest, dimensionOutcomes] = await Promise.all([
    getNpsOverviewForProject(orgId, projectId, { precomputedRecords: surveyResponseRecords }),
    getFeedbackThemeDigestForProject(orgId, projectId, { precomputedRecords: surveyResponseRecords }),
    Promise.all(DIMENSIONS.map((dimension) => getNpsDimensionBreakdownForProject(orgId, projectId, dimension.key))),
  ]);

  const total = overview.overall.totalResponses;
  const npsScore = overview.overall.npsScore;
  const npsAccent = total === 0 || npsScore === null ? 'neutral' : npsScore >= 50 ? 'mint' : npsScore >= 0 ? 'amber' : 'error';
  const npsBadge = total === 0 || npsScore === null ? undefined : npsScore >= 50 ? 'EXCELLENT' : npsScore >= 0 ? 'GOOD' : 'NEEDS ATTENTION';

  return (
    <PpPage>
      <PpPageHeader
        eyebrow="VOICE OF CUSTOMER"
        meta={total > 0 ? `${total} responses` : undefined}
        title={t('title', { projectName: project.name })}
        description={t('description')}
      />

      <PpKpiGrid>
        <PpKpiCard
          label={t('npsHeading')}
          value={total === 0 || npsScore === null ? '—' : npsScore >= 0 ? `+${npsScore}` : `${npsScore}`}
          badge={npsBadge}
          badgeAccent={npsAccent}
          accent={npsAccent}
          footer={
            total === 0
              ? t('npsEmpty')
              : t('npsBreakdownLine', {
                  promoters: overview.overall.promoters,
                  passives: overview.overall.passives,
                  detractors: overview.overall.detractors,
                  total,
                })
          }
        />
        <PpKpiCard
          label={t('promotersLabel')}
          value={total === 0 ? '—' : `${Math.round((overview.overall.promoters / total) * 100)}%`}
          progress={total === 0 ? 0 : (overview.overall.promoters / total) * 100}
          accent="mint"
          footer={`${overview.overall.promoters} ${t('promotersLabel').toLowerCase()}`}
        />
        <PpKpiCard
          label={t('passivesLabel')}
          value={total === 0 ? '—' : `${Math.round((overview.overall.passives / total) * 100)}%`}
          progress={total === 0 ? 0 : (overview.overall.passives / total) * 100}
          accent="amber"
          footer={`${overview.overall.passives} ${t('passivesLabel').toLowerCase()}`}
        />
        <PpKpiCard
          label={t('detractorsLabel')}
          value={total === 0 ? '—' : `${Math.round((overview.overall.detractors / total) * 100)}%`}
          progress={total === 0 ? 0 : (overview.overall.detractors / total) * 100}
          accent="pink"
          footer={`${overview.overall.detractors} ${t('detractorsLabel').toLowerCase()}`}
        />
      </PpKpiGrid>

      {total === 0 ? (
        <PpEmptyState
          icon={MessageSquare}
          title={t('npsHeading')}
          description={t('npsEmpty')}
        />
      ) : (
        <PpCard
          icon={MessageSquare}
          iconAccent="primary"
          title={t('npsHeading')}
          subtitle={t('npsBreakdownLine', {
            promoters: overview.overall.promoters,
            passives: overview.overall.passives,
            detractors: overview.overall.detractors,
            total,
          })}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 overflow-x-auto py-1" aria-label={t('trendSparklineLabel')}>
              {overview.dailyTrend.map((point) => (
                <div
                  key={point.date}
                  title={`${point.date}: ${point.breakdown.totalResponses === 0 ? t('trendPointEmpty') : point.breakdown.npsScore}`}
                  className="h-8 w-3 rounded-md bg-pp-primary transition-opacity"
                  style={{ opacity: point.breakdown.totalResponses > 0 ? 0.35 + Math.min(point.breakdown.totalResponses, 6) * 0.1 : 0.12 }}
                />
              ))}
            </div>
            <p className="text-pp-label-sm text-pp-outline">{t('trendSparklineLabel')}</p>
          </div>
        </PpCard>
      )}

      <PpCard
        icon={Sparkles}
        iconAccent="primary"
        title={t('themeDigestHeading')}
      >
        {themeDigest.length === 0 ? (
          <PpEmptyState
            icon={Sparkles}
            title={t('themeDigestHeading')}
            description={t('themeDigestEmpty')}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-pp-md">
            {themeDigest.map((cluster) => (
              <div
                key={cluster.theme}
                className="flex flex-col justify-between rounded-2xl border border-pp-outline-variant/30 bg-pp-surface-container-low/40 p-pp-md space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-pp-display text-pp-headline-sm font-semibold text-pp-on-surface">
                    {t(feedbackThemeLabelKey(cluster.theme))}
                  </span>
                  <PpPill accent="primary">{t('themeCommentCount', { count: cluster.commentCount })}</PpPill>
                </div>
                {cluster.exampleComments.map((comment, index) => (
                  <blockquote
                    key={index}
                    className="rounded-xl bg-pp-surface-container-lowest p-3 text-pp-body-sm text-pp-on-surface-variant italic border-s-2 border-pp-primary shadow-xs"
                  >
                    "{comment}"
                  </blockquote>
                ))}
              </div>
            ))}
          </div>
        )}
      </PpCard>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-pp-lg">
        {DIMENSIONS.map((dimension, index) => {
          const outcome = dimensionOutcomes[index];
          return (
            <PpCard
              key={dimension.key}
              icon={dimension.key === 'plan_interval' ? Database : dimension.key === 'channel_id' ? Layers : Sparkles}
              iconAccent={dimension.key === 'plan_interval' ? 'primary' : dimension.key === 'channel_id' ? 'mint' : 'sky'}
              title={t(dimension.headingKey)}
              flush={outcome.ok && outcome.rows.length > 0}
            >
              {!outcome.ok || outcome.rows.length === 0 ? (
                <PpEmptyState
                  icon={Database}
                  title={t(dimension.headingKey)}
                  description={t(dimension.emptyKey)}
                />
              ) : (
                <PpTable>
                  <thead>
                    <tr>
                      <th>Dimension</th>
                      <th className="text-end">NPS Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toNpsDimensionBreakdownRows(outcome.rows, dimension.key).map((row) => (
                      <tr key={row.value}>
                        <td className="font-medium text-pp-on-surface">{row.value || t('dimensionValueUnknown')}</td>
                        <td className="text-end">
                          {row.npsScore === null ? (
                            <span className="text-pp-outline">{t('dimensionScoreUnavailable')}</span>
                          ) : (
                            <PpPill accent={row.npsScore >= 50 ? 'mint' : row.npsScore >= 0 ? 'amber' : 'error'}>
                              {t('dimensionScoreLine', { score: row.npsScore, respondents: row.respondents })}
                            </PpPill>
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
    </PpPage>
  );
}
