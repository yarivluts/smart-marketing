import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { aggregateRepCollectionLeaderboard } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listBillingCollectionSignalsForProject, listOrgPeople, listOrgProjects, listRepCollectionEntriesForProject } from '@/lib/orgs/queries';
import { repCollectionTypeLabelKey, toRepCollectionBillingSignalRow, toRepCollectionEntryRow, toRepCollectionLeaderboardView } from '@/lib/orgs/rep-collection-view';
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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

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
  const t = await getTranslations('RepCollections');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          { key: 'week' as const, view: weekView },
          { key: 'month' as const, view: monthView },
        ].map(({ key, view }) => (
          <section key={key} className="flex flex-col gap-2 rounded-md border border-input px-4 py-3">
            <h2 className="text-lg font-semibold">{t(`leaderboardHeading.${key}`)}</h2>
            {view.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('leaderboardEmpty')}</p>
            ) : (
              <ol className="flex flex-col gap-1">
                {view.rows.map((row, index) => (
                  <li key={row.orgPersonId} className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="font-medium">{t('leaderboardRank', { rank: index + 1, name: row.name })}</span>
                    <span className="tabular-nums text-muted-foreground">{t('leaderboardRowSummary', { amount: row.totalAmount.toLocaleString(locale), count: row.entryCount })}</span>
                  </li>
                ))}
              </ol>
            )}
            {view.unattributedCount > 0 ? (
              <p className="text-xs text-muted-foreground">{t('leaderboardUnattributed', { amount: view.unattributedTotal.toLocaleString(locale), count: view.unattributedCount })}</p>
            ) : null}
          </section>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('signalsHeading')}</h2>
        {billingSignals.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noSignals')}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {billingSignals.map((signal) => (
              <li key={signal.rawRecordId} className="flex flex-col gap-2 rounded-md border border-input px-3 py-3 text-sm">
                <span className="text-xs text-muted-foreground">
                  {t('signalSummary', { customerId: signal.customerId, amount: signal.amount.toLocaleString(locale), currency: signal.currency.toUpperCase() })}
                </span>
                <CreateRepCollectionEntryForm orgId={orgId} projectId={projectId} people={peopleRows} signal={signal} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('ledgerHeading')}</h2>
        {entries.length === 0 ? (
          <p className="text-muted-foreground">{t('noEntries')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-input text-left text-xs text-muted-foreground">
                  <th className="py-2 pe-3 font-medium">{t('columnCompany')}</th>
                  <th className="py-2 pe-3 font-medium">{t('columnType')}</th>
                  <th className="py-2 pe-3 font-medium">{t('columnPlan')}</th>
                  <th className="py-2 pe-3 font-medium">{t('columnWhen')}</th>
                  <th className="py-2 pe-3 font-medium">{t('columnNote')}</th>
                  <th className="py-2 font-medium">{t('columnRepAndAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-input last:border-0">
                    <td className="py-2 pe-3 font-medium">{entry.company}</td>
                    <td className="py-2 pe-3">{t(repCollectionTypeLabelKey(entry.collectionType))}</td>
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
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('createHeading')}</h2>
        <CreateRepCollectionEntryForm orgId={orgId} projectId={projectId} people={peopleRows} />
      </section>
    </main>
  );
}
