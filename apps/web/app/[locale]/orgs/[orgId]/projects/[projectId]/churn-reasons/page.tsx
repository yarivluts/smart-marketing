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
import {
  PpPage,
  PpPageHeader,
  PpKpiGrid,
  PpKpiCard,
  PpCard,
  PpTable,
  PpEmptyState,
  PpPill,
} from '@/components/pastel/primitives';
import { TrendingDown, MessageSquare, Layers, ListOrdered, Calendar, UserCheck } from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ChurnReasons' });
  return { title: t('metaTitle') };
}

const DIMENSIONS: readonly { key: CancellationReasonBreakdownDimension; headingKey: string; emptyKey: string; icon: typeof Calendar }[] = [
  { key: 'plan_interval', headingKey: 'byPlanHeading', emptyKey: 'byPlanEmpty', icon: Layers },
  { key: 'channel_id', headingKey: 'byChannelHeading', emptyKey: 'byChannelEmpty', icon: UserCheck },
  { key: 'cohort_month', headingKey: 'byCohortHeading', emptyKey: 'byCohortEmpty', icon: Calendar },
];

/**
 * A project's structured + free-text churn-reason breakdown (KAN-84):
 * Evaluates reason codes, themes, and dimensions.
 *
 * Converted to Stitch Pastel Pulse design (desktop 381c5ffe, mobile 67f4a38f),
 * folding all real breakdown and verbatim themes without fabricated survey answers.
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
      <PpPage>
        <PpPageHeader
          eyebrow="CHURN DIAGNOSTICS PACK REQUIRED"
          title={t('title', { projectName: project.name })}
          description={t('setupIntro')}
        />
        <PpCard title="Install Metric Pack" subtitle="Activate churn reasons, cancellation themes, and cohort exit analysis">
          <InstallBuiltinPackSection orgId={orgId} projectId={projectId} packs={installablePacks} />
        </PpCard>
      </PpPage>
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

  const hasCancellationData = cancellationRecords.length > 0;
  const hasChurnedSubs = churnedSubs.length > 0;
  const hasChurnMetrics = Boolean(churnMetricsOutcome && churnMetricsOutcome.series && churnMetricsOutcome.series.length > 0);
  const isDataConnected = hasCancellationData || hasChurnedSubs || hasChurnMetrics;

  const totalReasonsCount = codeBreakdown.reduce((sum, item) => sum + item.count, 0);

  return (
    <PpPage>
      {/* 1. Header */}
      <PpPageHeader
        eyebrow="RETENTION & EXIT INTELLIGENCE"
        meta={isDataConnected ? 'Live Retention Telemetry' : 'Awaiting Ingestion'}
        title={t('title', { projectName: project.name })}
        description={t('description')}
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pp-secondary-container/60 px-3 py-1.5 text-xs font-semibold text-pp-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-pp-secondary animate-pulse" />
              <span>{isDataConnected ? 'v2.8 Diagnostics Live' : 'Awaiting Signals'}</span>
            </span>
          </div>
        }
      />

      {/* 2. Top KPI Deck */}
      <PpKpiGrid>
        <PpKpiCard
          label="Logged Reason Records"
          value={cancellationRecords.length}
          valueSuffix="events"
          accent="primary"
          footer="Captured cancellation events"
        />
        <PpKpiCard
          label="Reason Categories"
          value={codeBreakdown.length}
          valueSuffix="categories"
          badge={codeBreakdown.length > 0 ? 'Ranked' : 'Zero'}
          badgeAccent="mint"
          accent="mint"
          footer="Structured exit selections"
        />
        <PpKpiCard
          label="Verbatim Themes"
          value={themeDigest.length}
          valueSuffix="themes"
          badge={themeDigest.length > 0 ? 'Synthesized' : 'None'}
          badgeAccent="sky"
          accent="sky"
          footer="Free-text comment clusters"
        />
        <PpKpiCard
          label="Recent Churned Subs"
          value={churnedSubs.length}
          valueSuffix="subscriptions"
          badge={churnedSubs.length > 0 ? 'Logged' : 'None'}
          badgeAccent={churnedSubs.length > 0 ? 'pink' : 'mint'}
          accent="pink"
          footer="Recent cancellation queue"
        />
      </PpKpiGrid>

      {/* 3. Section 1: Structured Reason Codes */}
      <PpCard
        title={t('reasonCodeHeading')}
        subtitle="Distribution of customer-selected cancellation drivers ranked by frequency"
        icon={ListOrdered}
        iconAccent="primary"
        flush={codeBreakdown.length > 0}
      >
        {codeBreakdown.length === 0 ? (
          <p className="text-pp-body-md text-pp-on-surface-variant">{t('reasonCodeEmpty')}</p>
        ) : (
          <PpTable>
            <thead>
              <tr>
                <th>Reason Code</th>
                <th>Count</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {codeBreakdown.map((entry) => {
                const sharePct = totalReasonsCount > 0 ? ((entry.count / totalReasonsCount) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={entry.reasonCode}>
                    <td className="font-semibold text-pp-on-surface">
                      {t(cancellationReasonCodeLabelKey(entry.reasonCode))}
                    </td>
                    <td className="tabular-nums font-mono text-pp-on-surface">
                      {t('reasonCodeCount', { count: entry.count })}
                    </td>
                    <td className="tabular-nums font-mono">
                      <PpPill accent="neutral">
                        {sharePct}%
                      </PpPill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </PpTable>
        )}
      </PpCard>

      {/* 4. Section 2: Free-Text Themes Digest */}
      <PpCard
        title={t('themeDigestHeading')}
        subtitle="AI-synthesized themes and representative quotes from user exit comments"
        icon={MessageSquare}
        iconAccent="sky"
      >
        {themeDigest.length === 0 ? (
          <PpEmptyState
            icon={MessageSquare}
            title={t('themeDigestHeading')}
            description={t('themeDigestEmpty')}
          />
        ) : (
          <div className="space-y-4">
            {themeDigest.map((cluster) => (
              <div
                key={cluster.theme}
                className="rounded-2xl bg-pp-subtle-inset p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-sm text-pp-on-surface">
                    {t(cancellationReasonThemeLabelKey(cluster.theme))}
                  </span>
                  <PpPill accent="sky">
                    {t('themeCommentCount', { count: cluster.commentCount })}
                  </PpPill>
                </div>
                {cluster.exampleComments.length > 0 && (
                  <ul className="space-y-1.5 pl-2 border-s-2 border-pp-outline-variant/40">
                    {cluster.exampleComments.map((comment, index) => (
                      <li key={index} className="text-pp-body-sm text-pp-on-surface-variant italic">
                        &ldquo;{comment}&rdquo;
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </PpCard>

      {/* 5. Section 3: Dimensional Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {DIMENSIONS.map((dimension, index) => {
          const outcome = dimensionOutcomes[index];
          const IconComp = dimension.icon;
          return (
            <PpCard
              key={dimension.key}
              title={t(dimension.headingKey)}
              icon={IconComp}
              iconAccent="mint"
              flush={Boolean(outcome.ok && outcome.rows.length > 0)}
            >
              {!outcome.ok || outcome.rows.length === 0 ? (
                <p className="text-pp-body-sm text-pp-on-surface-variant p-4 pt-0">{t(dimension.emptyKey)}</p>
              ) : (
                <PpTable>
                  <thead>
                    <tr>
                      <th>Dimension</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toCancellationReasonDimensionBreakdownRows(outcome.rows, dimension.key).map((row) => (
                      <tr key={row.value}>
                        <td className="font-semibold text-pp-on-surface">
                          {row.value || t('dimensionValueUnknown')}
                        </td>
                        <td className="tabular-nums font-mono text-pp-on-surface">
                          {t('reasonCodeCount', { count: row.count })}
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
