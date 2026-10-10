import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { AlertTriangle, BarChart3, CreditCard, PieChart, PlugZap, Receipt, RotateCcw, UserMinus, Wallet, XCircle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  getBillingRecoveryForProject,
  listEnvironmentsForProject,
  listOrgProjects,
  listRecentBillingEventsForProject,
  listRecentChurnedSubscriptionsForProject,
  listRecentDunningSubscriptionsForProject,
} from '@/lib/orgs/queries';
import {
  DEFAULT_BILLING_OPS_FEED_LIMIT,
  DEFAULT_CHURN_FEED_LIMIT,
  DEFAULT_DUNNING_FEED_LIMIT,
} from '@growthos/firebase-orm-models';
import { billingOpsFeedEntryTypeLabelKey, splitOverFetchedFeed, toBillingOpsFeedEntryView, type BillingOpsFeedEntryType } from '@/lib/orgs/billing-ops-view';
import { BILLING_OPS_TYPES, billingOpsKpis, groupFeedByDay, summariseBillingFeed, sumMrrByCurrency } from '@/lib/orgs/billing-ops-summary';
import { toChurnFeedEntryView } from '@/lib/orgs/churn-feed-view';
import { dunningFeedEntryStatusLabelKey, toDunningFeedEntryView } from '@/lib/orgs/dunning-feed-view';
import { StatCard } from '@/components/ui/stat-card';
import { RecoveredPaymentsSection } from '@/components/orgs/recovered-payments-section';
import { FeedTimeline, type FeedTimelineGroup } from '@/components/orgs/feed-timeline';
import { ChartCard, DonutChart, EmptyState, PageHero, TrendChart, type VizStatus } from '@/components/viz';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'BillingOpsFeed' });
  return { title: t('metaTitle') };
}

const TYPE_TONE: Record<BillingOpsFeedEntryType, VizStatus> = { charge: 'ok', failed_payment: 'error', refund: 'warn' };
const TYPE_COLOR: Record<BillingOpsFeedEntryType, string> = {
  charge: 'hsl(var(--success))',
  failed_payment: 'hsl(var(--destructive))',
  refund: 'hsl(var(--warning))',
};

/**
 * A project's billing-ops feed (KAN-80, gap-analysis Gap 5+15: "operational record-level feeds" —
 * new charges / failed charges / refunds as a browsable list, the bridge from aggregate metrics to
 * daily ops). Reads the same landed `RawRecordModel`s KAN-36's event-volume sparkline already reads,
 * scoped to the Stripe billing event schemas (KAN-49). Gated on `ingest.write`, same "whole feature,
 * not just mutation, is admin-only" posture as the sibling ingest-health page — this feed exposes
 * per-customer payment failures, operationally sensitive the same way a quarantined record's raw
 * payload is.
 *
 * A second section (KAN-81, generalizing this same page + query pattern per plan `14 §Gap 5`'s "live
 * record feeds ... churn") lists the most recently landed `stripe_subscription` entities showing a
 * churn signal — already canceled or scheduled to cancel at period end.
 *
 * A third section (KAN-94) lists subscriptions currently in Stripe's dunning cycle (`past_due`/
 * `unpaid` status) — the gap doc's own stretch goal, closing the gap this doc comment used to flag as
 * deliberately out of scope ("no subscription-lifecycle/dunning model exists yet"): `status` is
 * already a landed field on every `stripe_subscription` entity (KAN-49), so a dunning feed needed only
 * a new predicate over the same snapshots the churn feed already reads, not a new model.
 *
 * A fourth section (KAN-304) pairs each failed payment with the successful charge that recovered it
 * inside the dunning window (`getBillingRecoveryForProject`) - recovered amounts per currency, the
 * recovery rate over attempts whose window has closed, and the time it took.
 *
 * The KPIs, per-day chart and currency totals are computed over exactly the entries listed, so they
 * inherit each feed's cap note: a truncated feed is a window, and its totals are a window's totals.
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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId, projectId })) {
    notFound();
  }

  // Each feed is fetched one row beyond its cap so truncation is MEASURED rather
  // than inferred. `entries.length === cap` cannot distinguish "exactly 100
  // landed" from "thousands landed", and on a billing page those read very
  // differently: the second means the operator is looking at a window, not a
  // ledger. The extra row is never rendered - it is evidence, not an entry.
  const [projects, rawRecords, churnRecords, dunningRecords, environments, recovery] = await Promise.all([
    listOrgProjects(orgId),
    listRecentBillingEventsForProject(orgId, projectId, DEFAULT_BILLING_OPS_FEED_LIMIT + 1),
    listRecentChurnedSubscriptionsForProject(orgId, projectId, DEFAULT_CHURN_FEED_LIMIT + 1),
    listRecentDunningSubscriptionsForProject(orgId, projectId, DEFAULT_DUNNING_FEED_LIMIT + 1),
    listEnvironmentsForProject(orgId, projectId),
    getBillingRecoveryForProject(orgId, projectId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const billingPage = splitOverFetchedFeed(rawRecords, DEFAULT_BILLING_OPS_FEED_LIMIT);
  const churnPage = splitOverFetchedFeed(churnRecords, DEFAULT_CHURN_FEED_LIMIT);
  const dunningPage = splitOverFetchedFeed(dunningRecords, DEFAULT_DUNNING_FEED_LIMIT);
  const billingTruncated = billingPage.truncated;
  const churnTruncated = churnPage.truncated;
  const dunningTruncated = dunningPage.truncated;
  const entries = billingPage.rows.map(toBillingOpsFeedEntryView);
  const churnEntries = churnPage.rows.map(toChurnFeedEntryView);
  const dunningEntries = dunningPage.rows.map(toDunningFeedEntryView);

  const t = await getTranslations('BillingOpsFeed');
  const tEnv = await getTranslations('EnvBadge');
  const environmentDisplayNameById = new Map(environments.map((environment) => [environment.id, tEnv(environment.name)]));
  const environmentName = (id: string): string => environmentDisplayNameById.get(id) ?? id;

  const integer = new Intl.NumberFormat(locale);
  const dayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const shortDay = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const timeFormat = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });
  const formatDay = (day: string, format: Intl.DateTimeFormat): string => {
    const parsed = new Date(`${day}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? day : format.format(parsed);
  };
  const formatTime = (iso: string): string => {
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? iso : timeFormat.format(parsed);
  };
  const amountShort = (amount: number | null, currency: string | null): string | undefined =>
    amount === null || currency === null ? undefined : t('amountShort', { amount: integer.format(amount), currency: currency.toUpperCase() });
  const meta = (landedAt: string, clientId: string, environmentId: string): string =>
    `${t('landedAtLine', { landedAt: formatTime(landedAt) })} · ${t('clientIdLine', { clientId })} · ${environmentName(environmentId)}`;

  const summary = summariseBillingFeed(entries);
  // With no billing events at all the counts are unknown, not zero - render the no-value state
  // so the KPIs never contradict the "connect Stripe" empty state below them.
  const kpis = billingOpsKpis(summary, { eventCount: entries.length, churnCount: churnEntries.length, dunningCount: dunningEntries.length });
  const kpiValue = (value: number | null): string => (value === null ? t('kpiNoValue') : integer.format(value));
  const eventKpiSub = kpis.hasBillingEvents ? t('kpiWindowSub', { count: entries.length }) : t('kpiNoEventsSub');
  const churnMrr = sumMrrByCurrency(churnEntries);
  const dunningMrr = sumMrrByCurrency(dunningEntries);
  const mrrLine = (totals: { currency: string; mrr: number }[]): string | undefined =>
    totals.length === 0 ? undefined : totals.map((total) => t('amountShort', { amount: integer.format(total.mrr), currency: total.currency })).join(' · ');

  const billingGroups: FeedTimelineGroup[] = groupFeedByDay(entries).map((group) => ({
    key: group.day,
    label: formatDay(group.day, dayFormat),
    items: group.entries.map((entry) => ({
      id: entry.id,
      tone: TYPE_TONE[entry.type],
      title: t(billingOpsFeedEntryTypeLabelKey(entry.type)),
      aside: amountShort(entry.amount, entry.currency) ?? t('amountUnknown'),
      lines: [
        ...(entry.customerId ? [{ text: t('customerLine', { customerId: entry.customerId }) }] : []),
        ...(entry.failureMessage ? [{ text: t('failureLine', { message: entry.failureMessage }), emphasis: true }] : []),
        ...(entry.refundReason ? [{ text: t('refundReasonLine', { reason: entry.refundReason }) }] : []),
      ],
      meta: meta(entry.landedAt, entry.clientId, entry.environmentId),
    })),
  }));
  const churnGroups: FeedTimelineGroup[] = groupFeedByDay(churnEntries).map((group) => ({
    key: group.day,
    label: formatDay(group.day, dayFormat),
    items: group.entries.map((entry) => ({
      id: entry.id,
      tone: entry.canceledAt ? 'error' : 'warn',
      title: entry.customerId ? t('customerLine', { customerId: entry.customerId }) : t('churnUnknownCustomer'),
      aside: entry.mrrNormalized === null || entry.currency === null ? t('amountUnknown') : t('mrrShort', { amount: integer.format(entry.mrrNormalized), currency: entry.currency.toUpperCase() }),
      lines: entry.canceledAt
        ? [{ text: t('canceledAtLine', { canceledAt: entry.canceledAt }), emphasis: true }]
        : entry.cancelAtPeriodEnd
          ? [{ text: t('cancelAtPeriodEndLine', { currentPeriodEnd: entry.currentPeriodEnd ?? '' }), emphasis: true }]
          : [],
      meta: meta(entry.landedAt, entry.clientId, entry.environmentId),
    })),
  }));
  const dunningGroups: FeedTimelineGroup[] = groupFeedByDay(dunningEntries).map((group) => ({
    key: group.day,
    label: formatDay(group.day, dayFormat),
    items: group.entries.map((entry) => ({
      id: entry.id,
      tone: entry.status === 'unpaid' ? 'error' : 'warn',
      title: entry.customerId ? t('customerLine', { customerId: entry.customerId }) : t('dunningUnknownCustomer'),
      aside: entry.mrrNormalized === null || entry.currency === null ? t('amountUnknown') : t('mrrShort', { amount: integer.format(entry.mrrNormalized), currency: entry.currency.toUpperCase() }),
      lines: [{ text: t(dunningFeedEntryStatusLabelKey(entry.status)), emphasis: true }],
      meta: meta(entry.landedAt, entry.clientId, entry.environmentId),
    })),
  }));

  const connectAction = (
    <Link
      href={`/orgs/${orgId}/projects/${projectId}/plugins`}
      className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
    >
      <PlugZap className="h-4 w-4" aria-hidden="true" />
      {t('connectStripeCta')}
    </Link>
  );

  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={Receipt} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('description')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiCharges')} value={kpiValue(kpis.charge)} icon={CreditCard} subtext={eventKpiSub} />
          <StatCard title={t('kpiFailed')} value={kpiValue(kpis.failed_payment)} icon={XCircle} subtext={eventKpiSub} />
          <StatCard title={t('kpiRefunds')} value={kpiValue(kpis.refund)} icon={RotateCcw} subtext={eventKpiSub} />
          <StatCard
            title={t('kpiAtRisk')}
            value={kpiValue(kpis.atRisk)}
            icon={AlertTriangle}
            subtext={kpis.atRisk === null ? t('kpiNoEventsSub') : t('kpiAtRiskSub', { churn: churnEntries.length, dunning: dunningEntries.length })}
          />
        </div>
      </PageHero>

      {entries.length === 0 ? (
        <EmptyState icon={Receipt} title={t('empty')} description={t('emptyHint')} action={connectAction} />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-5">
            <ChartCard title={t('activityTitle')} description={t('activityDescription')} icon={BarChart3} className="lg:col-span-3" fill>
              <TrendChart
                label={t('activityTitle')}
                kind="bar"
                stacked
                xKey="day"
                height={240}
                data={summary.byDay.map((row) => ({ day: formatDay(row.day, shortDay), charge: row.charge, failed_payment: row.failed_payment, refund: row.refund }))}
                series={BILLING_OPS_TYPES.map((type) => ({ key: type, label: t(billingOpsFeedEntryTypeLabelKey(type)), color: TYPE_COLOR[type] }))}
                showLegend
              />
            </ChartCard>
            <ChartCard title={t('mixTitle')} description={t('mixDescription')} icon={PieChart} className="lg:col-span-2" fill>
              <DonutChart
                label={t('mixTitle')}
                layout="stacked"
                size={160}
                centerValue={integer.format(entries.length)}
                centerLabel={t('mixCenterLabel')}
                data={BILLING_OPS_TYPES.filter((type) => summary.counts[type] > 0).map((type) => ({ label: t(billingOpsFeedEntryTypeLabelKey(type)), value: summary.counts[type], color: TYPE_COLOR[type] }))}
              />
            </ChartCard>
          </div>

          {summary.totalsByCurrency.length > 0 ? (
            <ChartCard title={t('totalsTitle')} description={t('totalsDescription')} icon={Wallet} footer={t('amountUnitNote')}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="py-2 pe-3 text-start font-medium">{t('columnCurrency')}</th>
                      {BILLING_OPS_TYPES.map((type) => (
                        <th key={type} className="py-2 pe-3 text-end font-medium">
                          {t(billingOpsFeedEntryTypeLabelKey(type))}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.totalsByCurrency.map((row) => (
                      <tr key={row.currency} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pe-3 font-semibold">{row.currency}</td>
                        {BILLING_OPS_TYPES.map((type) => (
                          <td key={type} className="py-2 pe-3 text-end tabular-nums" dir="ltr">
                            {integer.format(row[type])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          ) : null}

          <ChartCard
            title={t('timelineTitle')}
            description={billingTruncated ? t('capNoteTruncated', { count: entries.length }) : t('capNote', { count: entries.length })}
            icon={Receipt}
            footer={t('amountUnitNote')}
          >
            <FeedTimeline label={t('timelineTitle')} groups={billingGroups} />
          </ChartCard>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title={t('churnHeading')}
          description={churnTruncated ? t('churnCapNoteTruncated', { count: churnEntries.length }) : t('churnCapNote', { count: churnEntries.length })}
          icon={UserMinus}
          footer={mrrLine(churnMrr) ? t('mrrAtRiskLine', { amounts: mrrLine(churnMrr) ?? '' }) : undefined}
          fill
        >
          {churnEntries.length === 0 ? <EmptyState compact icon={UserMinus} title={t('churnEmpty')} /> : <FeedTimeline label={t('churnHeading')} groups={churnGroups} />}
        </ChartCard>
        <ChartCard
          title={t('dunningHeading')}
          description={dunningTruncated ? t('dunningCapNoteTruncated', { count: dunningEntries.length }) : t('dunningCapNote', { count: dunningEntries.length })}
          icon={AlertTriangle}
          footer={mrrLine(dunningMrr) ? t('mrrAtRiskLine', { amounts: mrrLine(dunningMrr) ?? '' }) : undefined}
          fill
        >
          {dunningEntries.length === 0 ? <EmptyState compact icon={AlertTriangle} title={t('dunningEmpty')} /> : <FeedTimeline label={t('dunningHeading')} groups={dunningGroups} />}
        </ChartCard>
      </div>

      <RecoveredPaymentsSection summary={recovery} />
    </div>
  );
}
