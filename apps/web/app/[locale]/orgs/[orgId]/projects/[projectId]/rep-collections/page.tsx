import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BookOpenCheck, CalendarDays, CalendarRange, Coins, Info, PieChart, PlusCircle, Receipt, Sparkles, Trophy } from 'lucide-react';
import { can } from '@growthos/shared';
import { aggregateRepCollectionLeaderboard } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listBillingCollectionSignalsForProject, listOrgPeople, listOrgProjects, listRepCollectionEntriesForProject } from '@/lib/orgs/queries';
import {
  repCollectionTypeLabelKey,
  toRepCollectionBillingSignalRow,
  toRepCollectionEntryRow,
  toRepCollectionInsights,
  toRepCollectionLeaderboardView,
} from '@/lib/orgs/rep-collection-view';
import { projectLedgerCurrency, signalCurrencyMatchesLedger } from '@/lib/orgs/rep-collection-currency';
import { CreateRepCollectionEntryForm } from '@/components/orgs/create-rep-collection-entry-form';
import { RepCollectionEntryControls } from '@/components/orgs/rep-collection-entry-controls';
import { StatCard } from '@/components/ui/stat-card';
import { BarList, ChartCard, DonutChart, EmptyState, PageHero, TrendChart } from '@/components/viz';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'RepCollections' });
  return { title: t('metaTitle') };
}

/** Months of history the collections-per-month chart covers. */
const TREND_MONTHS = 6;

/**
 * A project's rep-attributed collections ledger (KAN-88, E20.x, plan `14
 * §Gap 13`, "Get them Moneys"): weekly/monthly leaderboards per rep,
 * billing-auto-suggested candidates awaiting attribution, and the full
 * ledger table with inline rep/amount editing — gated on `dashboards.write`,
 * the same permission Goals/Segments/Campaign Ops use for a project-scoped
 * editable-attribution admin surface. Not a commission system; see
 * `RepCollectionEntryModel`'s own doc comment.
 */
export default async function RepCollectionsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Frep-collections`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId, projectId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  // `null` when the project has not configured one — the page then says the
  // amounts are unlabelled rather than picking a currency on its behalf.
  const ledgerCurrency = projectLedgerCurrency(project.currency);

  // Fetched once and reused for both leaderboard periods (via the pure
  // `aggregateRepCollectionLeaderboard`) and the billing-signal linked-id
  // check, rather than four independent full-ledger reads per page load.
  const [rawEntries, people] = await Promise.all([listRepCollectionEntriesForProject(orgId, projectId), listOrgPeople(orgId)]);
  const billingSignals = (await listBillingCollectionSignalsForProject(orgId, projectId, rawEntries)).map(toRepCollectionBillingSignalRow);
  const entries = rawEntries.map(toRepCollectionEntryRow);
  const peopleById = new Map(people.map((person) => [person.id, person.name]));
  // An archived person (KAN-129) drops out of the rep picker below — except an entry already
  // attributed to one keeps that option available too, so the picker still renders the entry's
  // real current rep instead of silently falling back to unattributed in the UI.
  const activePeople = people.filter((person) => !person.archived_at).map((person) => ({ id: person.id, name: person.name }));
  const peopleRows = activePeople;
  function repPickerOptions(orgPersonId: string | null) {
    if (!orgPersonId || activePeople.some((person) => person.id === orgPersonId)) {
      return activePeople;
    }
    const archivedRep = people.find((person) => person.id === orgPersonId);
    return archivedRep ? [...activePeople, { id: archivedRep.id, name: archivedRep.name }] : activePeople;
  }
  const weekView = toRepCollectionLeaderboardView(aggregateRepCollectionLeaderboard(rawEntries, 'week'), peopleById);
  const monthView = toRepCollectionLeaderboardView(aggregateRepCollectionLeaderboard(rawEntries, 'month'), peopleById);
  const insights = toRepCollectionInsights(entries, { now: new Date(), months: TREND_MONTHS });
  const t = await getTranslations('RepCollections');

  const numberFormat = new Intl.NumberFormat(locale);
  const monthFormat = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const formatAmount = (amount: number) => (ledgerCurrency === null ? amount.toLocaleString(locale) : t('amountWithCurrency', { amount: amount.toLocaleString(locale), currency: ledgerCurrency }));
  const periodTotal = (view: typeof weekView) => view.rows.reduce((sum, row) => sum + row.totalAmount, 0) + view.unattributedTotal;
  const periodCount = (view: typeof weekView) => view.rows.reduce((sum, row) => sum + row.entryCount, 0) + view.unattributedCount;

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={Coins} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('description')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('leaderboardHeading.week')} value={formatAmount(periodTotal(weekView))} subtext={t('kpiEntries', { count: periodCount(weekView) })} icon={CalendarDays} />
          <StatCard title={t('leaderboardHeading.month')} value={formatAmount(periodTotal(monthView))} subtext={t('kpiEntries', { count: periodCount(monthView) })} icon={CalendarRange} />
          <StatCard title={t('kpiLedgerTotal')} value={formatAmount(insights.total)} subtext={t('kpiEntries', { count: entries.length })} icon={BookOpenCheck} />
          <StatCard title={t('kpiSuggestions')} value={numberFormat.format(billingSignals.length)} icon={Sparkles} />
        </div>
        {/* The ledger stores `amount` as a bare number with no currency of its own,
            so every total below is shown in the project's configured currency —
            an assumption, stated as one, rather than a formatted number implying
            the system knows (KAN-171). */}
        <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {ledgerCurrency === null ? t('amountCurrencyUnsetNote') : t('amountCurrencyNote', { currency: ledgerCurrency })}
        </p>
      </PageHero>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {[
          { key: 'week' as const, view: weekView },
          { key: 'month' as const, view: monthView },
        ].map(({ key, view }) => (
          <ChartCard
            key={key}
            title={t(`leaderboardHeading.${key}`)}
            description={t('leaderboardDescription')}
            icon={Trophy}
            fill
            footer={
              view.unattributedCount > 0
                ? ledgerCurrency === null
                  ? t('leaderboardUnattributedNoCurrency', { amount: view.unattributedTotal.toLocaleString(locale), count: view.unattributedCount })
                  : t('leaderboardUnattributed', { amount: view.unattributedTotal.toLocaleString(locale), currency: ledgerCurrency, count: view.unattributedCount })
                : undefined
            }
          >
            {view.rows.length === 0 ? (
              <EmptyState icon={Trophy} title={t('leaderboardEmpty')} compact />
            ) : (
              <BarList
                items={view.rows.map((row, index) => ({
                  key: row.orgPersonId,
                  label: t('leaderboardRank', { rank: index + 1, name: row.name }),
                  sublabel: t('kpiEntries', { count: row.entryCount }),
                  value: row.totalAmount,
                }))}
                valueFormatter={formatAmount}
                color="hsl(var(--success))"
              />
            )}
          </ChartCard>
        ))}
      </div>

      {entries.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-5">
          <ChartCard title={t('trendTitle')} description={t('trendDescription', { months: TREND_MONTHS })} icon={CalendarRange} className="lg:col-span-3" fill>
            <TrendChart
              label={t('trendTitle')}
              xKey="month"
              kind="bar"
              valueFormat="compact"
              data={insights.monthly.map((bucket) => ({ month: monthFormat.format(new Date(bucket.start)), amount: bucket.total }))}
              series={[{ key: 'amount', label: ledgerCurrency === null ? t('trendSeries') : t('trendSeriesWithCurrency', { currency: ledgerCurrency }), color: 'hsl(var(--success))' }]}
            />
          </ChartCard>
          <ChartCard title={t('byTypeTitle')} description={t('byTypeDescription')} icon={PieChart} className="lg:col-span-2" fill>
            <DonutChart
              label={t('byTypeTitle')}
              layout="stacked"
              valueFormat="compact"
              centerValue={numberFormat.format(entries.length)}
              centerLabel={t('byTypeCenterLabel')}
              data={insights.byType.map((entry) => ({ label: t(repCollectionTypeLabelKey(entry.collectionType)), value: entry.total }))}
            />
          </ChartCard>
        </div>
      ) : null}

      <ChartCard title={t('signalsHeading')} description={t('signalsDescription')} icon={Receipt}>
        {billingSignals.length === 0 ? (
          <EmptyState icon={Receipt} title={t('noSignals')} compact />
        ) : (
          <ul className="flex flex-col gap-4">
            {billingSignals.map((signal) => (
              <li key={signal.rawRecordId} className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('signalSummary', { customerId: signal.customerId, amount: signal.amount.toLocaleString(locale), currency: signal.currency.toUpperCase() })}
                </span>
                {signalCurrencyMatchesLedger(signal.currency, ledgerCurrency) ? null : (
                  <p className="text-xs text-warning">{t('signalCurrencyMismatch', { signalCurrency: signal.currency.toUpperCase(), projectCurrency: ledgerCurrency ?? '' })}</p>
                )}
                <CreateRepCollectionEntryForm orgId={orgId} projectId={projectId} people={peopleRows} signal={signal} />
              </li>
            ))}
          </ul>
        )}
      </ChartCard>

      <ChartCard title={t('ledgerHeading')} description={t('ledgerDescription')} icon={BookOpenCheck}>
        {entries.length === 0 ? (
          <EmptyState icon={BookOpenCheck} title={t('noEntries')} description={t('noEntriesDetail')} compact />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pe-3 text-start font-medium">{t('columnCompany')}</th>
                  <th className="py-2 pe-3 text-start font-medium">{t('columnType')}</th>
                  <th className="py-2 pe-3 text-start font-medium">{t('columnPlan')}</th>
                  <th className="py-2 pe-3 text-start font-medium">{t('columnWhen')}</th>
                  <th className="py-2 pe-3 text-start font-medium">{t('columnNote')}</th>
                  <th className="py-2 text-start font-medium">{t('columnRepAndAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30">
                    <td className="py-2 pe-3 font-medium">{entry.company}</td>
                    <td className="py-2 pe-3">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{t(repCollectionTypeLabelKey(entry.collectionType))}</span>
                    </td>
                    <td className="py-2 pe-3 text-xs text-muted-foreground">
                      {entry.planFrom && entry.planTo
                        ? t('planSummary', { from: entry.planFrom, to: entry.planTo })
                        : entry.planFrom
                          ? t('planFromOnly', { from: entry.planFrom })
                          : entry.planTo
                            ? t('planToOnly', { to: entry.planTo })
                            : ''}
                    </td>
                    <td className="py-2 pe-3 text-xs text-muted-foreground">{entry.occurredAt}</td>
                    <td className="py-2 pe-3 text-xs text-muted-foreground">{entry.note ?? ''}</td>
                    <td className="py-2">
                      <RepCollectionEntryControls orgId={orgId} projectId={projectId} entryId={entry.id} orgPersonId={entry.orgPersonId} amount={entry.amount} people={repPickerOptions(entry.orgPersonId)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      <ChartCard title={t('createHeading')} description={t('createDescription')} icon={PlusCircle}>
        <CreateRepCollectionEntryForm orgId={orgId} projectId={projectId} people={peopleRows} />
      </ChartCard>
    </main>
  );
}
