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
  getCancellationReasonFeedForProject,
  getCancellationReasonThemeDigestForProject,
  listCancellationReasonRecordsForProject,
  listOrgProjects,
  listPluginInstallsForProject,
  listRecentChurnedSubscriptionsForProject,
  queryMetrics,
} from '@/lib/orgs/queries';
import { hasActiveInstall, toPluginInstallView } from '@/lib/orgs/plugin-view';
import {
  cancellationReasonCodeLabelKey,
  cancellationReasonThemeLabelKey,
  cancellationReasonPillAccent,
  winbackPotentialAccent,
  toCancellationReasonDimensionBreakdownRows,
} from '@/lib/orgs/churn-reason-view';
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
import {
  MessageSquare,
  Layers,
  ListOrdered,
  Calendar,
  UserCheck,
  ShieldAlert,
  Zap,
  PauseCircle,
  CreditCard,
  Headphones,
  Users,
} from 'lucide-react';

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
 * A project's structured + free-text churn-reason breakdown and live exit survey ledger (KAN-84, KAN-306):
 * Evaluates reason codes, themes, winback playbooks, and streaming exit telemetry.
 *
 * Converted to Stitch Pastel Pulse design (desktop 381c5ffe, mobile 67f4a38f),
 * folding authentic live feedback without fabricated survey data.
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

  const [codeBreakdown, themeDigest, dimensionOutcomes, cancellationFeed] = await Promise.all([
    getCancellationReasonCodeBreakdownForProject(orgId, projectId, { precomputedRecords: cancellationRecords }),
    getCancellationReasonThemeDigestForProject(orgId, projectId, { precomputedRecords: cancellationRecords }),
    Promise.all(DIMENSIONS.map((dimension) => getCancellationReasonDimensionBreakdownForProject(orgId, projectId, dimension.key))),
    getCancellationReasonFeedForProject(orgId, projectId, { precomputedRecords: cancellationRecords }),
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
          label={t('kpiLoggedEvents')}
          value={cancellationRecords.length}
          valueSuffix="events"
          accent="primary"
          footer="Captured cancellation events"
        />
        <PpKpiCard
          label={t('kpiCategories')}
          value={codeBreakdown.length}
          valueSuffix="categories"
          badge={codeBreakdown.length > 0 ? 'Ranked' : 'Zero'}
          badgeAccent="mint"
          accent="mint"
          footer="Structured exit selections"
        />
        <PpKpiCard
          label={t('kpiThemes')}
          value={themeDigest.length}
          valueSuffix="themes"
          badge={themeDigest.length > 0 ? 'Synthesized' : 'None'}
          badgeAccent="sky"
          accent="sky"
          footer="Free-text comment clusters"
        />
        <PpKpiCard
          label={t('kpiRecentSubs')}
          value={churnedSubs.length}
          valueSuffix="subscriptions"
          badge={churnedSubs.length > 0 ? 'Logged' : 'None'}
          badgeAccent={churnedSubs.length > 0 ? 'pink' : 'mint'}
          accent="pink"
          footer="Recent cancellation queue"
        />
      </PpKpiGrid>

      {/* 3. Split Grid Workspace (7:5 Column Ratio) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT PANE: Pareto Breakdown & Themes & Dimensions (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Structured Reason Codes */}
          <PpCard
            title={t('reasonCodeHeading')}
            subtitle="Distribution of customer-selected cancellation drivers ranked by frequency"
            icon={ListOrdered}
            iconAccent="primary"
            flush={codeBreakdown.length > 0}
          >
            {codeBreakdown.length === 0 ? (
              <p className="text-pp-body-md text-pp-on-surface-variant p-6">{t('reasonCodeEmpty')}</p>
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
                    const pillAccent = cancellationReasonPillAccent(entry.reasonCode);
                    return (
                      <tr key={entry.reasonCode}>
                        <td className="font-semibold text-pp-on-surface">
                          <div className="flex items-center gap-2">
                            <PpPill accent={pillAccent}>
                              {t(cancellationReasonCodeLabelKey(entry.reasonCode))}
                            </PpPill>
                          </div>
                        </td>
                        <td className="tabular-nums font-mono text-pp-on-surface">
                          {t('reasonCodeCount', { count: entry.count })}
                        </td>
                        <td className="tabular-nums font-mono">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-pp-outline-variant/30 overflow-hidden">
                              <div
                                className="h-full bg-pp-primary rounded-full"
                                style={{ width: `${Math.min(100, Math.max(8, Number(sharePct)))}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold">{sharePct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </PpTable>
            )}
          </PpCard>

          {/* Free-Text Themes Digest */}
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

          {/* Dimensional Breakdown Grid */}
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
        </div>

        {/* RIGHT PANE: Customer Rescue Playbooks (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <PpCard
            title={t('playbooksHeading')}
            subtitle={t('playbooksSubtitle')}
            icon={Zap}
            iconAccent="primary"
          >
            {/* Status Strip */}
            <div className="p-3.5 bg-pp-secondary-container/30 rounded-2xl flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-pp-secondary animate-pulse" />
                <div>
                  <div className="font-semibold text-xs text-pp-on-surface">{t('playbooksActive')}</div>
                  <div className="text-[11px] text-pp-on-surface-variant">{t('playbooksConfidence')}</div>
                </div>
              </div>
              <PpPill accent="mint">Active</PpPill>
            </div>

            {/* Playbooks Stack */}
            <div className="space-y-3.5">
              {/* Playbook 1: Pre-Cancellation Pause Offer */}
              <div className="p-4 rounded-2xl border border-pp-outline-variant/30 hover:border-pp-primary/40 transition-all bg-pp-surface-bright space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-pp-primary-container/40 flex items-center justify-center text-pp-primary">
                      <PauseCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-xs text-pp-on-surface">{t('playbookPauseDiscount')}</h4>
                      <p className="text-[10px] text-pp-on-surface-variant">{t('playbookTriggerPause')}</p>
                    </div>
                  </div>
                  <PpPill accent="mint">Armed</PpPill>
                </div>
                <p className="text-pp-body-sm text-pp-on-surface-variant text-xs">
                  {t('playbookDescPause')}
                </p>
                <div className="flex items-center justify-between pt-1 border-t border-pp-outline-variant/20 text-[11px] font-semibold text-pp-secondary">
                  <span>{t('playbookStatPause')}</span>
                </div>
              </div>

              {/* Playbook 2: Dunning & Smart Retry */}
              <div className="p-4 rounded-2xl border border-pp-outline-variant/30 hover:border-pp-primary/40 transition-all bg-pp-surface-bright space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-pp-tertiary-container/30 flex items-center justify-center text-pp-tertiary">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-xs text-pp-on-surface">{t('playbookSmartDunning')}</h4>
                      <p className="text-[10px] text-pp-on-surface-variant">{t('playbookTriggerDunning')}</p>
                    </div>
                  </div>
                  <PpPill accent="sky">Armed</PpPill>
                </div>
                <p className="text-pp-body-sm text-pp-on-surface-variant text-xs">
                  {t('playbookDescDunning')}
                </p>
                <div className="flex items-center justify-between pt-1 border-t border-pp-outline-variant/20 text-[11px] font-semibold text-pp-secondary">
                  <span>{t('playbookStatDunning')}</span>
                </div>
              </div>

              {/* Playbook 3: Executive Outreach */}
              <div className="p-4 rounded-2xl border border-pp-outline-variant/30 hover:border-pp-primary/40 transition-all bg-pp-surface-bright space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-800">
                      <Headphones className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-xs text-pp-on-surface">{t('playbookExecutiveOutreach')}</h4>
                      <p className="text-[10px] text-pp-on-surface-variant">{t('playbookTriggerExec')}</p>
                    </div>
                  </div>
                  <PpPill accent="pink">Armed</PpPill>
                </div>
                <p className="text-pp-body-sm text-pp-on-surface-variant text-xs">
                  {t('playbookDescExec')}
                </p>
                <div className="flex items-center justify-between pt-1 border-t border-pp-outline-variant/20 text-[11px] font-semibold text-pp-secondary">
                  <span>{t('playbookStatExec')}</span>
                </div>
              </div>

              {/* Playbook 4: Adoption Concierge */}
              <div className="p-4 rounded-2xl border border-pp-outline-variant/30 hover:border-pp-primary/40 transition-all bg-pp-surface-bright space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-teal-100 flex items-center justify-center text-teal-800">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-xs text-pp-on-surface">{t('playbookAdoptionConcierge')}</h4>
                      <p className="text-[10px] text-pp-on-surface-variant">{t('playbookTriggerAdoption')}</p>
                    </div>
                  </div>
                  <PpPill accent="mint">Armed</PpPill>
                </div>
                <p className="text-pp-body-sm text-pp-on-surface-variant text-xs">
                  {t('playbookDescAdoption')}
                </p>
                <div className="flex items-center justify-between pt-1 border-t border-pp-outline-variant/20 text-[11px] font-semibold text-pp-secondary">
                  <span>{t('playbookStatAdoption')}</span>
                </div>
              </div>
            </div>
          </PpCard>
        </div>
      </div>

      {/* 4. Bottom Section: Recent Cancellation Log & Exit Survey Feedback Ledger */}
      <PpCard
        title={t('ledgerHeading')}
        subtitle={t('ledgerSubtitle')}
        icon={ShieldAlert}
        iconAccent="pink"
        flush={cancellationFeed.length > 0}
      >
        {cancellationFeed.length === 0 ? (
          <div className="p-6">
            <PpEmptyState
              icon={ShieldAlert}
              title={t('ledgerHeading')}
              description={t('ledgerEmpty')}
            />
          </div>
        ) : (
          <PpTable>
            <thead>
              <tr>
                <th>{t('ledgerColAccount')}</th>
                <th>{t('ledgerColReason')}</th>
                <th>{t('ledgerColVoice')}</th>
                <th>{t('ledgerColWinback')}</th>
                <th className="text-right">{t('ledgerColLanded')}</th>
              </tr>
            </thead>
            <tbody>
              {cancellationFeed.map((item) => {
                const reasonPill = cancellationReasonPillAccent(item.reasonCode);
                const winbackAccent = winbackPotentialAccent(item.winback.potential);
                const potentialLabel =
                  item.winback.potential === 'high'
                    ? t('potentialHigh')
                    : item.winback.potential === 'medium'
                      ? t('potentialMedium')
                      : t('potentialLow');

                return (
                  <tr key={item.id} className="hover:bg-pp-surface-container-low/40 transition-colors">
                    <td className="font-medium text-pp-on-surface">
                      <div className="font-semibold text-xs">{item.customerId ?? t('ledgerUnknownCustomer')}</div>
                      <div className="text-[11px] text-pp-on-surface-variant font-mono">{item.id.slice(0, 16)}</div>
                    </td>
                    <td>
                      <PpPill accent={reasonPill}>
                        {t(cancellationReasonCodeLabelKey(item.reasonCode))}
                      </PpPill>
                    </td>
                    <td className="max-w-md">
                      {item.comment ? (
                        <p className="text-xs italic text-pp-on-surface-variant line-clamp-2">
                          &ldquo;{item.comment}&rdquo;
                        </p>
                      ) : (
                        <span className="text-xs text-pp-outline italic">{t('ledgerNoComment')}</span>
                      )}
                    </td>
                    <td>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <PpPill accent={winbackAccent}>{potentialLabel}</PpPill>
                          <span className="text-xs font-mono font-semibold text-pp-on-surface">
                            {t('winbackScore', { score: item.winback.score })}
                          </span>
                        </div>
                        <div className="text-[11px] text-pp-primary font-medium">
                          {item.winback.playbookTitle}
                        </div>
                      </div>
                    </td>
                    <td className="text-right text-xs font-mono text-pp-on-surface-variant whitespace-nowrap">
                      {item.landedAt.slice(0, 10)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </PpTable>
        )}
      </PpCard>
    </PpPage>
  );
}
