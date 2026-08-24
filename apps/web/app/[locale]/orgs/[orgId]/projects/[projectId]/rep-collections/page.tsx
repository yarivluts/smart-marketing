import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { REP_COLLECTIONS_PACK_PLUGIN_ID } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  builtinMetricPacks,
  getRepCollectionsLeaderboardForProject,
  listCollectionActivityForProject,
  listCustomerOwnersForProject,
  listOrgPeople,
  listOrgProjects,
  listPluginInstallsForProject,
} from '@/lib/orgs/queries';
import { hasActiveInstall, toPluginInstallView } from '@/lib/orgs/plugin-view';
import { collectionActivityTypeLabelKey } from '@/lib/orgs/rep-collections-view';
import { InstallBuiltinPackSection } from '@/components/orgs/install-builtin-pack-section';
import { AssignCustomerOwnerForm } from '@/components/orgs/assign-customer-owner-form';
import { CustomerOwnerSelect } from '@/components/orgs/customer-owner-select';
import { LogCollectionActivityForm } from '@/components/orgs/log-collection-activity-form';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'RepCollections' });
  return { title: t('metaTitle') };
}

const RECENT_ACTIVITY_LIMIT = 20;

/**
 * Rep-attributed collections ledger (KAN-88, E20.x, plan `14 §Gap 13`): a
 * leaderboard + per-customer owner assignment table backed by the Rep
 * Collections pack's `collected_revenue_by_customer` metric (installed the
 * same one-click way as Campaign Ops's own payback section), plus an
 * activity ledger — a log of calls/emails/notes/follow-ups a rep made
 * toward collecting on a customer's account, independent of pack install
 * status (logging an activity needs no warehouse data). Gated on
 * `dashboards.write`, the same permission Goals/Segments/Campaign Ops use
 * for a project-scoped editable-target admin surface.
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

  const [projects, installs, people] = await Promise.all([
    listOrgProjects(orgId),
    listPluginInstallsForProject(orgId, projectId),
    listOrgPeople(orgId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const installViews = installs.map(toPluginInstallView);
  const packInstalled = hasActiveInstall(installViews, REP_COLLECTIONS_PACK_PLUGIN_ID);

  const [leaderboardOutcome, savedOwners, activities] = await Promise.all([
    packInstalled ? getRepCollectionsLeaderboardForProject(orgId, projectId) : Promise.resolve(null),
    listCustomerOwnersForProject(orgId, projectId),
    listCollectionActivityForProject(orgId, projectId, { limit: RECENT_ACTIVITY_LIMIT }),
  ]);

  const nameByPerson = new Map(people.map((person) => [person.id, person.name]));
  // Plain, client-safe rows — a Firestore model instance can't cross the server/client boundary
  // (the same mapping `segments/page.tsx` does for its own owner picker).
  const personRows = people.map((person) => ({ id: person.id, name: person.name }));

  // Owner assignment must stay usable before a warehouse exists (KAN-18), so this falls back to
  // the saved assignments alone rather than hiding the whole surface behind a successful
  // warehouse query — `collectedRevenue: null` renders as "not available yet", not as zero.
  const customerRows: { customerId: string; collectedRevenue: number | null; ownerPersonId: string | null }[] = leaderboardOutcome?.ok
    ? leaderboardOutcome.customers.map((row) => ({ customerId: row.customerId, collectedRevenue: row.collectedRevenue, ownerPersonId: row.ownerPersonId }))
    : savedOwners.map((owner) => ({ customerId: owner.customer_id, collectedRevenue: null, ownerPersonId: owner.owner_person_id }));

  const t = await getTranslations('RepCollections');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('leaderboardHeading')}</h2>
        {!packInstalled ? (
          <InstallBuiltinPackSection orgId={orgId} projectId={projectId} packs={builtinMetricPacks().filter((pack) => pack.pluginId === REP_COLLECTIONS_PACK_PLUGIN_ID)} />
        ) : !leaderboardOutcome || !leaderboardOutcome.ok ? (
          <p className="text-muted-foreground">{t('leaderboardUnavailable')}</p>
        ) : leaderboardOutcome.rows.length === 0 ? (
          <p className="text-muted-foreground">{t('leaderboardEmpty')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-input text-left text-xs text-muted-foreground">
                <th className="py-2 pe-3 font-medium">{t('columnRep')}</th>
                <th className="py-2 pe-3 font-medium">{t('columnCollectedRevenue')}</th>
                <th className="py-2 font-medium">{t('columnCustomerCount')}</th>
              </tr>
            </thead>
            <tbody>
              {leaderboardOutcome.rows.map((row) => (
                <tr key={row.ownerPersonId ?? 'unassigned'} className="border-b border-input last:border-0">
                  <td className="py-2 pe-3 font-medium">{row.ownerName ?? t('unassignedOption')}</td>
                  <td className="py-2 pe-3 tabular-nums">{row.collectedRevenue.toLocaleString(locale)}</td>
                  <td className="py-2 tabular-nums">{row.customerCount.toLocaleString(locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('customersHeading')}</h2>
        <AssignCustomerOwnerForm orgId={orgId} projectId={projectId} people={personRows} />
        {customerRows.length === 0 ? (
          <p className="text-muted-foreground">{t('customersEmpty')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-input text-left text-xs text-muted-foreground">
                <th className="py-2 pe-3 font-medium">{t('columnCustomer')}</th>
                <th className="py-2 pe-3 font-medium">{t('columnCollectedRevenue')}</th>
                <th className="py-2 font-medium">{t('columnOwner')}</th>
              </tr>
            </thead>
            <tbody>
              {customerRows.map((row) => (
                <tr key={row.customerId} className="border-b border-input last:border-0">
                  <td className="py-2 pe-3 font-medium">{row.customerId}</td>
                  <td className="py-2 pe-3 tabular-nums">
                    {row.collectedRevenue === null ? t('collectedRevenueUnavailable') : row.collectedRevenue.toLocaleString(locale)}
                  </td>
                  <td className="py-2">
                    <CustomerOwnerSelect orgId={orgId} projectId={projectId} customerId={row.customerId} ownerPersonId={row.ownerPersonId} people={personRows} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('activityHeading')}</h2>
        <LogCollectionActivityForm orgId={orgId} projectId={projectId} people={personRows} />
        {activities.length === 0 ? (
          <p className="text-muted-foreground">{t('activityEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {activities.map((activity) => (
              <li key={activity.id} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{activity.customer_id}</span>
                  <span className="text-xs text-muted-foreground">{t(collectionActivityTypeLabelKey(activity.activity_type))}</span>
                  <span className="text-xs text-muted-foreground">{nameByPerson.get(activity.person_id) ?? activity.person_id}</span>
                  <span className="text-xs text-muted-foreground">{new Date(activity.occurred_at).toLocaleString(locale)}</span>
                </div>
                {activity.note ? <p className="text-muted-foreground">{activity.note}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
