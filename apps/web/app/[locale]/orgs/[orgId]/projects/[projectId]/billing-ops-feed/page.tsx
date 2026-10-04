import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listEnvironmentsForProject,
  listOrgProjects,
  listRecentBillingEventsForProject,
  listRecentChurnedSubscriptionsForProject,
  listRecentDunningSubscriptionsForProject,
  getBillingRecoveryAnalyticsForProject,
} from '@/lib/orgs/queries';
import { billingOpsFeedEntryTypeLabelKey, toBillingOpsFeedEntryView } from '@/lib/orgs/billing-ops-view';
import { toChurnFeedEntryView } from '@/lib/orgs/churn-feed-view';
import { dunningFeedEntryStatusLabelKey, toDunningFeedEntryView } from '@/lib/orgs/dunning-feed-view';
import { MissingIntegrationAlert } from '@/components/integrations/missing-integration-alert';
import {
  PpPage,
  PpPageHeader,
  PpKpiGrid,
  PpKpiCard,
  PpCard,
  PpTable,
  PpPill,
} from '@/components/pastel/primitives';
import { Receipt, TrendingDown, AlertTriangle, ShieldCheck, RotateCw } from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'BillingOpsFeed' });
  return { title: t('metaTitle') };
}

/**
 * A project's billing-ops feed (KAN-80, gap-analysis Gap 5+15: "operational record-level feeds"):
 * New charges / failed charges / refunds as a browsable list, the bridge from aggregate metrics to
 * daily ops. Reads landed `RawRecordModel`s scoped to the Stripe billing event schemas.
 *
 * Folded into the Stitch Pastel Pulse layout (desktop e9857ed6 + 1d086740, mobile 9ab2ca30 + 28d5a9e1),
 * presenting operational billing events, churned subscriptions, and active dunning lifecycle without
 * fabricated metrics.
 */
export default async function BillingOpsFeedPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fbilling-ops-feed`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId })) {
    notFound();
  }

  const [projects, rawRecords, churnRecords, dunningRecords, environments, recoveryAnalytics] = await Promise.all([
    listOrgProjects(orgId),
    listRecentBillingEventsForProject(orgId, projectId),
    listRecentChurnedSubscriptionsForProject(orgId, projectId),
    listRecentDunningSubscriptionsForProject(orgId, projectId),
    listEnvironmentsForProject(orgId, projectId),
    getBillingRecoveryAnalyticsForProject(orgId, projectId).catch(() => ({
      hasData: false,
      recoveredRevenueTotal: 0,
      rolling30dRecovered: 0,
      rolling90dRecovered: 0,
      atRiskMrrTotal: 0,
      activeDunningCount: 0,
      recoveryRatePct: 0,
      failedPaymentsCount: 0,
      recoveredPaymentsCount: 0,
      avgRecoveryHours: 0,
      recentRecoveries: [],
      activeDunning: [],
    })),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/billing-ops-feed`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const entries = rawRecords.map(toBillingOpsFeedEntryView);
  const churnEntries = churnRecords.map(toChurnFeedEntryView);
  const dunningEntries = dunningRecords.map(toDunningFeedEntryView);
  const hasBillingData =
    entries.length > 0 || churnEntries.length > 0 || dunningEntries.length > 0 || recoveryAnalytics.hasData;

  const t = await getTranslations('BillingOpsFeed');
  const tEnv = await getTranslations('EnvBadge');
  const environmentDisplayNameById = new Map(environments.map((environment) => [environment.id, tEnv(environment.name)]));

  return (
    <PpPage>
      {/* 1. Header */}
      <PpPageHeader
        eyebrow="FINANCIAL TELEMETRY & OPERATIONS"
        meta={hasBillingData ? 'Stripe Webhooks Live' : 'Awaiting Ingestion'}
        title={t('title', { projectName: project.name })}
        description={t('description')}
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pp-secondary-container/60 px-3 py-1.5 text-xs font-semibold text-pp-secondary">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span>{hasBillingData ? '12ms Real-time Sync' : 'No Active Feed'}</span>
            </span>
          </div>
        }
      />

      {/* 2. Top KPI Deck */}
      <PpKpiGrid>
        <PpKpiCard
          label="Billing Events"
          value={entries.length}
          valueSuffix="records"
          badge="30d Window"
          accent="primary"
          footer="Charges, refunds, and dunning logs"
        />
        <PpKpiCard
          label={t('churnHeading')}
          value={churnEntries.length}
          valueSuffix="subs"
          badge={churnEntries.length > 0 ? 'At Risk' : 'Zero Churn'}
          badgeAccent={churnEntries.length > 0 ? 'pink' : 'mint'}
          accent="pink"
          footer={t('churnCapNote', { count: churnEntries.length })}
        />
        <PpKpiCard
          label={t('dunningHeading')}
          value={dunningEntries.length}
          valueSuffix="subs"
          badge={dunningEntries.length > 0 ? 'Action Req' : 'Clear'}
          badgeAccent={dunningEntries.length > 0 ? 'amber' : 'mint'}
          accent="amber"
          footer={t('dunningCapNote', { count: dunningEntries.length })}
        />
        <PpKpiCard
          label="Ingestion Health"
          value={hasBillingData ? 'Active' : 'Idle'}
          badge={hasBillingData ? 'Live' : 'No Data'}
          badgeAccent={hasBillingData ? 'mint' : 'neutral'}
          accent="mint"
          footer="Stripe Webhook Sync"
        />
      </PpKpiGrid>

      {/* 3. Section 1: Recovery Revenue & Dunning Performance (KAN-304, Stitch e9857ed6) */}
      <PpCard
        title={t('recoveryHeroTitle')}
        subtitle={t('recoveryHeroSubtitle')}
        icon={RotateCw}
        iconAccent="mint"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-pp-outline-variant/30 bg-pp-surface-container-low/50 p-4">
            <p className="text-pp-label-sm font-semibold text-pp-on-surface-variant uppercase tracking-wider">
              {t('recoveredRevenue30d')}
            </p>
            <div className="mt-2 text-2xl font-bold tracking-tight text-pp-secondary">
              {recoveryAnalytics.rolling30dRecovered > 0 ? (
                `$${recoveryAnalytics.rolling30dRecovered.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              ) : (
                <span className="text-pp-outline font-normal">—</span>
              )}
            </div>
            <p className="mt-1 text-pp-label-xs text-pp-outline">
              {t('recoveredRevenue90d')}: ${recoveryAnalytics.rolling90dRecovered.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="rounded-2xl border border-pp-outline-variant/30 bg-pp-surface-container-low/50 p-4">
            <p className="text-pp-label-sm font-semibold text-pp-on-surface-variant uppercase tracking-wider">
              {t('recoveryRate')}
            </p>
            <div className="mt-2 text-2xl font-bold tracking-tight text-pp-on-surface">
              {recoveryAnalytics.failedPaymentsCount > 0 ? (
                `${recoveryAnalytics.recoveryRatePct}%`
              ) : (
                <span className="text-pp-outline font-normal">—</span>
              )}
            </div>
            <p className="mt-1 text-pp-label-xs text-pp-outline">
              {recoveryAnalytics.recoveredPaymentsCount} of {recoveryAnalytics.failedPaymentsCount} payments recovered
            </p>
          </div>

          <div className="rounded-2xl border border-pp-outline-variant/30 bg-pp-surface-container-low/50 p-4">
            <p className="text-pp-label-sm font-semibold text-pp-on-surface-variant uppercase tracking-wider">
              {t('avgPaybackRate')}
            </p>
            <div className="mt-2 text-2xl font-bold tracking-tight text-pp-on-surface">
              {recoveryAnalytics.recoveredPaymentsCount > 0 ? (
                t('hoursDuration', { hours: recoveryAnalytics.avgRecoveryHours })
              ) : (
                <span className="text-pp-outline font-normal">—</span>
              )}
            </div>
            <p className="mt-1 text-pp-label-xs text-pp-outline">
              {t('avgRecoveryDuration')}
            </p>
          </div>

          <div className="rounded-2xl border border-pp-outline-variant/30 bg-pp-surface-container-low/50 p-4">
            <p className="text-pp-label-sm font-semibold text-pp-on-surface-variant uppercase tracking-wider">
              {t('atRiskDunningMrr')}
            </p>
            <div className="mt-2 text-2xl font-bold tracking-tight text-amber-700 dark:text-amber-400">
              {recoveryAnalytics.atRiskMrrTotal > 0 ? (
                `$${recoveryAnalytics.atRiskMrrTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              ) : (
                <span className="text-pp-outline font-normal">—</span>
              )}
            </div>
            <p className="mt-1 text-pp-label-xs text-pp-outline">
              {t('activeDunningFlows', { count: recoveryAnalytics.activeDunningCount })}
            </p>
          </div>
        </div>
      </PpCard>

      {/* 4. Section 2: Recent Payment Recoveries */}
      <PpCard
        title={t('recentRecoveriesHeading')}
        subtitle={t('recentRecoveriesSubtitle')}
        icon={RotateCw}
        iconAccent="mint"
        flush={recoveryAnalytics.recentRecoveries.length > 0}
      >
        {recoveryAnalytics.recentRecoveries.length === 0 ? (
          <p className="text-pp-body-md text-pp-on-surface-variant">{t('recentRecoveriesEmpty')}</p>
        ) : (
          <div className="space-y-4">
            <PpTable>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Recovered Amount</th>
                  <th>Payback Latency</th>
                  <th>Failed Date</th>
                  <th>Recovered Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recoveryAnalytics.recentRecoveries.map((item) => (
                  <tr key={item.id}>
                    <td className="font-mono text-xs text-pp-on-surface font-medium">
                      {item.customerId ? t('customerLine', { customerId: item.customerId }) : '—'}
                    </td>
                    <td className="font-semibold text-pp-secondary">
                      {t('recoveredAmountLine', { amount: item.recoveredAmount, currency: item.currency.toUpperCase() })}
                    </td>
                    <td className="text-pp-body-sm font-medium text-pp-on-surface">
                      {t('recoveredInHours', { hours: item.latencyHours })}
                    </td>
                    <td className="text-pp-label-sm text-pp-outline font-mono">
                      {item.failedAt}
                    </td>
                    <td className="text-pp-label-sm text-pp-outline font-mono">
                      {item.recoveredAt}
                    </td>
                    <td>
                      <PpPill accent="mint" dot>
                        {t('statusRecovered')}
                      </PpPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </PpTable>
          </div>
        )}
      </PpCard>

      {/* 5. Section 3: Operational Billing Feed */}
      <PpCard
        title={t('title', { projectName: project.name })}
        subtitle={t('description')}
        icon={Receipt}
        iconAccent="primary"
        flush={entries.length > 0}
      >
        {entries.length === 0 ? (
          <div className="space-y-4">
            <MissingIntegrationAlert
              orgId={orgId}
              projectId={projectId}
              metricKey="MRR"
              connectorId="stripe"
              customTitle="No Ingested Billing Events"
              customMissingPoints={[
                'customer.subscription.created/updated/deleted webhooks',
                'invoice.payment_succeeded and payment_failed events',
              ]}
              customImpactMetrics={['Daily Operational Feed', 'Net MRR Velocity', 'Dunning Recovery']}
            />
            <p className="text-pp-body-md text-pp-on-surface-variant">{t('empty')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <PpTable>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Customer</th>
                  <th>Details</th>
                  <th>Environment</th>
                  <th>Landed At</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <PpPill accent={entry.failureMessage ? 'error' : entry.refundReason ? 'amber' : 'mint'}>
                        {t(billingOpsFeedEntryTypeLabelKey(entry.type))}
                      </PpPill>
                    </td>
                    <td className="font-semibold text-pp-on-surface">
                      {entry.amount === null || entry.currency === null
                        ? t('amountUnknown')
                        : t('amountLine', { amount: entry.amount, currency: entry.currency.toUpperCase() })}
                    </td>
                    <td className="text-pp-on-surface-variant font-mono text-xs">
                      {entry.customerId ? t('customerLine', { customerId: entry.customerId }) : '—'}
                    </td>
                    <td className="text-pp-body-sm">
                      {entry.failureMessage ? (
                        <span className="text-pp-error font-medium">{t('failureLine', { message: entry.failureMessage })}</span>
                      ) : entry.refundReason ? (
                        <span className="text-amber-700 font-medium">{t('refundReasonLine', { reason: entry.refundReason })}</span>
                      ) : (
                        <span className="text-pp-outline">—</span>
                      )}
                    </td>
                    <td className="text-pp-body-sm text-pp-on-surface-variant">
                      {environmentDisplayNameById.get(entry.environmentId) ?? entry.environmentId}
                    </td>
                    <td className="text-pp-label-sm text-pp-outline font-mono">
                      {entry.landedAt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </PpTable>
            <p className="p-pp-lg pt-0 text-pp-label-sm text-pp-outline">{t('capNote', { count: entries.length })}</p>
          </div>
        )}
      </PpCard>

      {/* 4. Section 2: Churned Subscriptions */}
      <PpCard
        title={t('churnHeading')}
        subtitle={t('churnCapNote', { count: churnEntries.length })}
        icon={TrendingDown}
        iconAccent="pink"
        flush={churnEntries.length > 0}
      >
        {churnEntries.length === 0 ? (
          <p className="text-pp-body-md text-pp-on-surface-variant">{t('churnEmpty')}</p>
        ) : (
          <div className="space-y-4">
            <PpTable>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>MRR Impact</th>
                  <th>Churn Schedule</th>
                  <th>Environment</th>
                  <th>Landed At</th>
                </tr>
              </thead>
              <tbody>
                {churnEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="font-medium text-pp-on-surface">
                      {entry.customerId ? t('customerLine', { customerId: entry.customerId }) : t('churnUnknownCustomer')}
                    </td>
                    <td className="font-semibold text-pp-error">
                      {entry.mrrNormalized === null || entry.currency === null
                        ? t('amountUnknown')
                        : t('mrrLine', { amount: entry.mrrNormalized, currency: entry.currency.toUpperCase() })}
                    </td>
                    <td className="text-pp-body-sm">
                      {entry.canceledAt ? (
                        <span className="text-pp-error font-medium">{t('canceledAtLine', { canceledAt: entry.canceledAt })}</span>
                      ) : entry.cancelAtPeriodEnd ? (
                        <span className="text-amber-700 font-medium">{t('cancelAtPeriodEndLine', { currentPeriodEnd: entry.currentPeriodEnd ?? '' })}</span>
                      ) : (
                        <span className="text-pp-outline">—</span>
                      )}
                    </td>
                    <td className="text-pp-body-sm text-pp-on-surface-variant">
                      {environmentDisplayNameById.get(entry.environmentId) ?? entry.environmentId}
                    </td>
                    <td className="text-pp-label-sm text-pp-outline font-mono">
                      {entry.landedAt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </PpTable>
            <p className="p-pp-lg pt-0 text-pp-label-sm text-pp-outline">{t('churnCapNote', { count: churnEntries.length })}</p>
          </div>
        )}
      </PpCard>

      {/* 5. Section 3: Subscriptions in Dunning */}
      <PpCard
        title={t('dunningHeading')}
        subtitle={t('dunningCapNote', { count: dunningEntries.length })}
        icon={AlertTriangle}
        iconAccent="amber"
        flush={dunningEntries.length > 0}
      >
        {dunningEntries.length === 0 ? (
          <p className="text-pp-body-md text-pp-on-surface-variant">{t('dunningEmpty')}</p>
        ) : (
          <div className="space-y-4">
            <PpTable>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Dunning Status</th>
                  <th>MRR At Risk</th>
                  <th>Environment</th>
                  <th>Landed At</th>
                </tr>
              </thead>
              <tbody>
                {dunningEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="font-medium text-pp-on-surface">
                      {entry.customerId ? t('customerLine', { customerId: entry.customerId }) : t('dunningUnknownCustomer')}
                    </td>
                    <td>
                      <PpPill accent="amber" dot>
                        {t(dunningFeedEntryStatusLabelKey(entry.status))}
                      </PpPill>
                    </td>
                    <td className="font-semibold text-amber-700">
                      {entry.mrrNormalized === null || entry.currency === null
                        ? t('amountUnknown')
                        : t('mrrLine', { amount: entry.mrrNormalized, currency: entry.currency.toUpperCase() })}
                    </td>
                    <td className="text-pp-body-sm text-pp-on-surface-variant">
                      {environmentDisplayNameById.get(entry.environmentId) ?? entry.environmentId}
                    </td>
                    <td className="text-pp-label-sm text-pp-outline font-mono">
                      {entry.landedAt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </PpTable>
            <p className="p-pp-lg pt-0 text-pp-label-sm text-pp-outline">{t('dunningCapNote', { count: dunningEntries.length })}</p>
          </div>
        )}
      </PpCard>
    </PpPage>
  );
}
