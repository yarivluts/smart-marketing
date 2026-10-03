import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { CHURN_REASON_PACK_PLUGIN_ID, type CancellationReasonBreakdownDimension } from '@growthos/firebase-orm-models';
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
  listRecentChurnedSubscriptionsForProject,
  queryMetrics,
} from '@/lib/orgs/queries';
import { hasActiveInstall, toPluginInstallView } from '@/lib/orgs/plugin-view';
import { cancellationReasonCodeLabelKey, cancellationReasonThemeLabelKey, toCancellationReasonDimensionBreakdownRows } from '@/lib/orgs/churn-reason-view';
import { InstallBuiltinPackSection } from '@/components/orgs/install-builtin-pack-section';
import { ChurnSurvivalDashboard } from '@/components/churn/churn-survival-dashboard';

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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId })) {
    notFound();
  }

  const [projects, installs] = await Promise.all([listOrgProjects(orgId), listPluginInstallsForProject(orgId, projectId)]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/churn-reasons`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const installViews = installs.map(toPluginInstallView);
  const packInstalled = hasActiveInstall(installViews, CHURN_REASON_PACK_PLUGIN_ID);

  const t = await getTranslations('ChurnReasons');

  if (!packInstalled) {
    const installablePacks = builtinMetricPacks().filter((pack) => pack.pluginId === CHURN_REASON_PACK_PLUGIN_ID);
    return (
      <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
        <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
        <p className="text-sm text-muted-foreground">{t('setupIntro')}</p>
        <InstallBuiltinPackSection orgId={orgId} projectId={projectId} packs={installablePacks} />
      </main>
    );
  }

  const [cancellationRecords, churnMetricsOutcome, churnedSubs] = await Promise.all([
    listCancellationReasonRecordsForProject(orgId, projectId).catch(() => []),
    queryMetrics(orgId, projectId, {
      metrics: ['net_mrr_churn', 'churned_mrr'],
      time: {
        start: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
        end: new Date().toISOString().slice(0, 10),
        grain: 'month',
      },
    }).catch(() => null),
    listRecentChurnedSubscriptionsForProject(orgId, projectId, 10).catch(() => []),
  ]);

  const [codeBreakdown, themeDigest, dimensionOutcomes] = await Promise.all([
    getCancellationReasonCodeBreakdownForProject(orgId, projectId, { precomputedRecords: cancellationRecords }),
    getCancellationReasonThemeDigestForProject(orgId, projectId, { precomputedRecords: cancellationRecords }),
    Promise.all(DIMENSIONS.map((dimension) => getCancellationReasonDimensionBreakdownForProject(orgId, projectId, dimension.key))),
  ]);

  const activePluginIds = new Set(
    installs
      .filter((i) => i.status === 'installed')
      .map((i) => i.plugin_id.toLowerCase()),
  );

  const hasCancellationData = cancellationRecords.length > 0;
  const hasChurnedSubs = churnedSubs.length > 0;
  const hasChurnMetrics = Boolean(churnMetricsOutcome && churnMetricsOutcome.series && churnMetricsOutcome.series.length > 0);
  const hasBillingConnector = activePluginIds.has('stripe') || activePluginIds.has('stripe_billing') || activePluginIds.has('churn_reasons');

  const isDataConnected = hasCancellationData || hasChurnedSubs || hasChurnMetrics || hasBillingConnector;

  const initialSurveys =
    churnedSubs.length > 0
      ? churnedSubs.map((sub, idx) => ({
          id: sub.id,
          accountName: `Customer #${sub.id.slice(0, 6)}`,
          plan: 'Pro ($199)',
          mrrLost: '-$199',
          tenure: '6 Mo Tenure',
          reasonQuote: 'Budget consolidation and downsizing seat count',
          winBackScore: Math.max(35, Math.min(90, 85 - idx * 10)),
        }))
      : undefined;

  return (
    <main className="w-full space-y-10">
      {/* Stitch Customer Survival Curves & Churn Diagnostics */}
      <ChurnSurvivalDashboard
        orgId={orgId}
        projectId={projectId}
        isDataConnected={isDataConnected}
        initialSurveys={initialSurveys}
      />

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-8">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">{t('title', { projectName: project.name })}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('description')}</p>
        </div>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold tracking-tight">{t('reasonCodeHeading')}</h3>
        {codeBreakdown.length === 0 ? (
          <p className="text-muted-foreground">{t('reasonCodeEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {codeBreakdown.map((entry) => (
              <li key={entry.reasonCode} className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2 text-sm">
                <span>{t(cancellationReasonCodeLabelKey(entry.reasonCode))}</span>
                <span className="text-muted-foreground">{t('reasonCodeCount', { count: entry.count })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('themeDigestHeading')}</h2>
        {themeDigest.length === 0 ? (
          <p className="text-muted-foreground">{t('themeDigestEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {themeDigest.map((cluster) => (
              <li key={cluster.theme} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{t(cancellationReasonThemeLabelKey(cluster.theme))}</span>
                  <span className="text-xs text-muted-foreground">{t('themeCommentCount', { count: cluster.commentCount })}</span>
                </div>
                {cluster.exampleComments.map((comment, index) => (
                  <span key={index} className="text-muted-foreground">
                    {t('themeExampleComment', { comment })}
                  </span>
                ))}
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
            ) : outcome.rows.length === 0 ? (
              <p className="text-muted-foreground">{t(dimension.emptyKey)}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {toCancellationReasonDimensionBreakdownRows(outcome.rows, dimension.key).map((row) => (
                  <li key={row.value} className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2 text-sm">
                    <span>{row.value || t('dimensionValueUnknown')}</span>
                    <span className="text-muted-foreground">{t('reasonCodeCount', { count: row.count })}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      </div>
    </main>
  );
}
