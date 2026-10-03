import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Bell, Coins, FileText, Plus, Trophy, Users } from 'lucide-react';
import { can } from '@growthos/shared';
import { aggregateRepCollectionLeaderboard } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listBillingCollectionSignalsForProject,
  listOrgPeople,
  listOrgProjects,
  listRepCollectionEntriesForProject,
} from '@/lib/orgs/queries';
import {
  repCollectionTypeLabelKey,
  toRepCollectionBillingSignalRow,
  toRepCollectionEntryRow,
  toRepCollectionLeaderboardView,
} from '@/lib/orgs/rep-collection-view';
import {
  PpButton,
  PpCard,
  PpEmptyState,
  PpKpiCard,
  PpKpiGrid,
  PpPage,
  PpPageHeader,
  PpPill,
  PpTable,
} from '@/components/pastel/primitives';
import { CreateRepCollectionEntryForm } from '@/components/orgs/create-rep-collection-entry-form';
import { RepCollectionEntryControls } from '@/components/orgs/rep-collection-entry-controls';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'RepCollections' });
  return { title: t('metaTitle') };
}

const TYPE_ACCENTS: Record<string, 'primary' | 'mint' | 'amber' | 'sky' | 'neutral'> = {
  upgrade: 'primary',
  expansion: 'mint',
  save: 'amber',
  renewal: 'sky',
  other: 'neutral',
};

/**
 * Stitch "Pastel Pulse" rep-attributed collections ledger (desktop bcb541bd, mobile 507d4d2b).
 *
 * Weekly/monthly sales leaderboards, live billing signals awaiting attribution,
 * reconciled ledger table with inline editing, and manual collection logger.
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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/rep-collections`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const [rawEntries, people] = await Promise.all([
    listRepCollectionEntriesForProject(orgId, projectId),
    listOrgPeople(orgId),
  ]);
  const billingSignals = (await listBillingCollectionSignalsForProject(orgId, projectId, rawEntries)).map(
    toRepCollectionBillingSignalRow,
  );
  const entries = rawEntries.map(toRepCollectionEntryRow);
  const peopleById = new Map(people.map((person) => [person.id, person.name]));

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
  const t = await getTranslations('RepCollections');

  const monthTotal =
    monthView.rows.reduce((sum, row) => sum + row.totalAmount, 0) + monthView.unattributedTotal;
  const monthEntriesCount =
    monthView.rows.reduce((sum, row) => sum + row.entryCount, 0) + monthView.unattributedCount;
  const billingSignalsTotal = billingSignals.reduce((sum, s) => sum + s.amount, 0);
  const topCloser = monthView.rows[0];

  return (
    <PpPage>
      <PpPageHeader
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        description={t('description')}
        actions={
          <PpButton variant="primary" size="sm" icon={Plus} asChild>
            <a href="#log-collection">
              <span>{t('createHeading')}</span>
            </a>
          </PpButton>
        }
      />

      {/* KPI Overview */}
      <PpKpiGrid>
        <PpKpiCard
          label={t('kpiMtdCollections')}
          value={`$${monthTotal.toLocaleString(locale, { maximumFractionDigits: 0 })}`}
          accent="primary"
          badge={monthEntriesCount > 0 ? `${monthEntriesCount} deals` : undefined}
          badgeAccent="primary"
          footer={t('kpiMtdSubtitle', { count: monthEntriesCount })}
        />
        <PpKpiCard
          label={t('kpiActiveClosers')}
          value={monthView.rows.length}
          valueSuffix={t('kpiRepsSuffix')}
          accent="mint"
          badge={monthView.rows.length > 0 ? `${monthView.rows.length} active` : undefined}
          badgeAccent="mint"
          footer={
            monthView.unattributedCount > 0
              ? t('kpiUnattributedFooter', { count: monthView.unattributedCount })
              : t('kpiAllAttributed')
          }
        />
        <PpKpiCard
          label={t('kpiBillingSignals')}
          value={billingSignals.length}
          valueSuffix={t('kpiSignalsSuffix')}
          accent={billingSignals.length > 0 ? 'amber' : 'neutral'}
          badge={billingSignals.length > 0 ? t('needsTriage') : undefined}
          badgeAccent="amber"
          footer={
            billingSignals.length > 0
              ? `$${billingSignalsTotal.toLocaleString(locale, { maximumFractionDigits: 0 })} awaiting claim`
              : t('allSignalsTriaged')
          }
        />
        <PpKpiCard
          label={t('kpiTopCloser')}
          value={topCloser ? `$${topCloser.totalAmount.toLocaleString(locale, { maximumFractionDigits: 0 })}` : '—'}
          accent={topCloser ? 'pink' : 'neutral'}
          badge={topCloser ? topCloser.name : undefined}
          badgeAccent="pink"
          footer={topCloser ? `${topCloser.entryCount} deals closed` : t('noClosersYet')}
        />
      </PpKpiGrid>

      {/* Weekly & Monthly Leaderboards (Bento Modules) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Weekly Leaderboard */}
        <PpCard
          title={t('leaderboardHeading.week')}
          subtitle={t('weekSubtitle')}
          icon={Trophy}
          iconAccent="amber"
          action={
            <PpPill accent="amber" dot>
              {weekView.rows.reduce((sum, r) => sum + r.entryCount, 0)} deals
            </PpPill>
          }
        >
          {weekView.rows.length === 0 ? (
            <PpEmptyState icon={Trophy} title={t('leaderboardEmpty')} />
          ) : (
            <div className="flex flex-col gap-3">
              {weekView.rows.map((row, index) => (
                <div
                  key={row.orgPersonId}
                  className="flex items-center justify-between rounded-xl bg-pp-surface-container-low/60 p-3 transition-colors hover:bg-pp-surface-container"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                        index === 0
                          ? 'bg-amber-100 text-amber-900'
                          : index === 1
                            ? 'bg-slate-200 text-slate-800'
                            : index === 2
                              ? 'bg-orange-100 text-orange-900'
                              : 'bg-pp-surface-container text-pp-outline'
                      }`}
                    >
                      #{index + 1}
                    </span>
                    <div>
                      <div className="font-semibold text-pp-on-surface">{row.name}</div>
                      <div className="text-xs text-pp-outline">
                        {row.entryCount} {row.entryCount === 1 ? 'deal' : 'deals'}
                      </div>
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="font-pp-display text-pp-headline-md font-bold text-pp-on-surface">
                      ${row.totalAmount.toLocaleString(locale)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {weekView.unattributedCount > 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-3 text-xs text-amber-900">
              {t('leaderboardUnattributed', {
                amount: `$${weekView.unattributedTotal.toLocaleString(locale)}`,
                count: weekView.unattributedCount,
              })}
            </div>
          ) : null}
        </PpCard>

        {/* Monthly Leaderboard */}
        <PpCard
          title={t('leaderboardHeading.month')}
          subtitle={t('monthSubtitle')}
          icon={Coins}
          iconAccent="mint"
          action={
            <PpPill accent="mint" dot>
              ${monthTotal.toLocaleString(locale, { maximumFractionDigits: 0 })}
            </PpPill>
          }
        >
          {monthView.rows.length === 0 ? (
            <PpEmptyState icon={Coins} title={t('leaderboardEmpty')} />
          ) : (
            <div className="flex flex-col gap-4">
              {monthView.rows.map((row, index) => {
                const maxAmount = monthView.rows[0]?.totalAmount || 1;
                const pct = Math.round((row.totalAmount / maxAmount) * 100);
                return (
                  <div key={row.orgPersonId} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-pp-on-surface">
                          {index + 1}. {row.name}
                        </span>
                        <span className="text-xs text-pp-outline">({row.entryCount} deals)</span>
                      </div>
                      <span className="font-bold text-pp-on-surface">${row.totalAmount.toLocaleString(locale)}</span>
                    </div>
                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-pp-surface-container"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full rounded-full bg-pp-secondary transition-all duration-300"
                        style={{ width: `${Math.max(5, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {monthView.unattributedCount > 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-pp-outline-variant bg-pp-surface-container-low/60 p-3 text-xs text-pp-outline">
              {t('leaderboardUnattributed', {
                amount: `$${monthView.unattributedTotal.toLocaleString(locale)}`,
                count: monthView.unattributedCount,
              })}
            </div>
          ) : null}
        </PpCard>
      </div>

      {/* Suggested from Billing Signals */}
      <PpCard
        title={t('signalsHeading')}
        subtitle={t('signalsSubtitle')}
        icon={Bell}
        iconAccent="amber"
        action={
          billingSignals.length > 0 ? (
            <PpPill accent="amber" dot>
              {billingSignals.length} {t('needsTriage')}
            </PpPill>
          ) : undefined
        }
      >
        {billingSignals.length === 0 ? (
          <PpEmptyState icon={Bell} title={t('noSignals')} />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {billingSignals.map((signal) => (
              <div
                key={signal.rawRecordId}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-pp-outline-variant/40 bg-pp-surface-container-low/40 p-4 transition-all hover:bg-pp-surface-container-low"
              >
                <div className="flex items-center justify-between">
                  <PpPill accent="amber">{signal.currency.toUpperCase()}</PpPill>
                  <span className="font-mono text-xs text-pp-outline">{signal.occurredAt.slice(0, 10)}</span>
                </div>
                <div>
                  <div className="font-semibold text-pp-on-surface">Customer: {signal.customerId}</div>
                  <div className="font-pp-display text-pp-headline-md font-bold text-pp-on-surface">
                    ${signal.amount.toLocaleString(locale)}
                  </div>
                </div>
                <div className="border-t border-pp-outline-variant/30 pt-3">
                  <CreateRepCollectionEntryForm
                    orgId={orgId}
                    projectId={projectId}
                    people={peopleRows}
                    signal={signal}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </PpCard>

      {/* Reconciled Collections Ledger */}
      <PpCard
        title={t('ledgerHeading')}
        subtitle={t('ledgerSubtitle', { count: entries.length })}
        icon={FileText}
        iconAccent="primary"
        flush
      >
        {entries.length === 0 ? (
          <div className="p-pp-lg">
            <PpEmptyState icon={FileText} title={t('noEntries')} />
          </div>
        ) : (
          <PpTable>
            <thead>
              <tr>
                <th>{t('columnCompany')}</th>
                <th>{t('columnType')}</th>
                <th>{t('columnPlan')}</th>
                <th>{t('columnWhen')}</th>
                <th>{t('columnNote')}</th>
                <th>{t('columnRepAndAmount')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const typeAccent = TYPE_ACCENTS[entry.collectionType] ?? 'neutral';
                const planText =
                  entry.planFrom && entry.planTo
                    ? t('planSummary', { from: entry.planFrom, to: entry.planTo })
                    : entry.planFrom
                      ? t('planFromOnly', { from: entry.planFrom })
                      : entry.planTo
                        ? t('planToOnly', { to: entry.planTo })
                        : '—';

                return (
                  <tr key={entry.id}>
                    <td className="font-semibold text-pp-on-surface">{entry.company}</td>
                    <td>
                      <PpPill accent={typeAccent}>{t(repCollectionTypeLabelKey(entry.collectionType))}</PpPill>
                    </td>
                    <td className="text-xs text-pp-outline">{planText}</td>
                    <td className="font-mono text-xs text-pp-outline">{entry.occurredAt}</td>
                    <td className="max-w-[200px] truncate text-xs text-pp-on-surface-variant" title={entry.note ?? ''}>
                      {entry.note || '—'}
                    </td>
                    <td>
                      <RepCollectionEntryControls
                        orgId={orgId}
                        projectId={projectId}
                        entryId={entry.id}
                        orgPersonId={entry.orgPersonId}
                        amount={entry.amount}
                        people={repPickerOptions(entry.orgPersonId)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </PpTable>
        )}
      </PpCard>

      {/* Manual Log Entry Section */}
      <div id="log-collection">
        <PpCard
          title={t('createHeading')}
          subtitle={t('createSubtitle')}
          icon={Plus}
          iconAccent="primary"
        >
          <CreateRepCollectionEntryForm orgId={orgId} projectId={projectId} people={peopleRows} />
        </PpCard>
      </div>
    </PpPage>
  );
}
