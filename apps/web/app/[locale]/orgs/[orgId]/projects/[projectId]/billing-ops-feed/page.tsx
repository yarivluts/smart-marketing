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
} from '@/lib/orgs/queries';
import {
  DEFAULT_BILLING_OPS_FEED_LIMIT,
  DEFAULT_CHURN_FEED_LIMIT,
  DEFAULT_DUNNING_FEED_LIMIT,
} from '@growthos/firebase-orm-models';
import { billingOpsFeedEntryTypeLabelKey, splitOverFetchedFeed, toBillingOpsFeedEntryView } from '@/lib/orgs/billing-ops-view';
import { toChurnFeedEntryView } from '@/lib/orgs/churn-feed-view';
import { dunningFeedEntryStatusLabelKey, toDunningFeedEntryView } from '@/lib/orgs/dunning-feed-view';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'BillingOpsFeed' });
  return { title: t('metaTitle') };
}

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
  const [projects, rawRecords, churnRecords, dunningRecords, environments] = await Promise.all([
    listOrgProjects(orgId),
    listRecentBillingEventsForProject(orgId, projectId, DEFAULT_BILLING_OPS_FEED_LIMIT + 1),
    listRecentChurnedSubscriptionsForProject(orgId, projectId, DEFAULT_CHURN_FEED_LIMIT + 1),
    listRecentDunningSubscriptionsForProject(orgId, projectId, DEFAULT_DUNNING_FEED_LIMIT + 1),
    listEnvironmentsForProject(orgId, projectId),
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

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      <section className="flex flex-col gap-3">
        {entries.length === 0 ? (
          <p className="text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{t(billingOpsFeedEntryTypeLabelKey(entry.type))}</span>
                  <span className="text-xs text-muted-foreground">
                    {environmentDisplayNameById.get(entry.environmentId) ?? entry.environmentId}
                  </span>
                </div>
                <span className="text-muted-foreground">
                  {entry.amount === null || entry.currency === null
                    ? t('amountUnknown')
                    : t('amountLine', { amount: entry.amount, currency: entry.currency.toUpperCase() })}
                  {entry.customerId ? ` · ${t('customerLine', { customerId: entry.customerId })}` : ''}
                </span>
                {entry.failureMessage ? <span className="text-destructive">{t('failureLine', { message: entry.failureMessage })}</span> : null}
                {entry.refundReason ? <span className="text-muted-foreground">{t('refundReasonLine', { reason: entry.refundReason })}</span> : null}
                <span className="text-xs text-muted-foreground">
                  {`${t('landedAtLine', { landedAt: entry.landedAt })} · ${t('clientIdLine', { clientId: entry.clientId })}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {billingTruncated ? t('capNoteTruncated', { count: entries.length }) : t('capNote', { count: entries.length })}
        </p>
        <p className="text-xs text-muted-foreground">{t('amountUnitNote')}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('churnHeading')}</h2>
        {churnEntries.length === 0 ? (
          <p className="text-muted-foreground">{t('churnEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {churnEntries.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">
                    {entry.customerId ? t('customerLine', { customerId: entry.customerId }) : t('churnUnknownCustomer')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {environmentDisplayNameById.get(entry.environmentId) ?? entry.environmentId}
                  </span>
                </div>
                <span className="text-muted-foreground">
                  {entry.mrrNormalized === null || entry.currency === null
                    ? t('amountUnknown')
                    : t('mrrLine', { amount: entry.mrrNormalized, currency: entry.currency.toUpperCase() })}
                </span>
                {entry.canceledAt ? (
                  <span className="text-destructive">{t('canceledAtLine', { canceledAt: entry.canceledAt })}</span>
                ) : entry.cancelAtPeriodEnd ? (
                  <span className="text-destructive">{t('cancelAtPeriodEndLine', { currentPeriodEnd: entry.currentPeriodEnd ?? '' })}</span>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {`${t('landedAtLine', { landedAt: entry.landedAt })} · ${t('clientIdLine', { clientId: entry.clientId })}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {churnTruncated ? t('churnCapNoteTruncated', { count: churnEntries.length }) : t('churnCapNote', { count: churnEntries.length })}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('dunningHeading')}</h2>
        {dunningEntries.length === 0 ? (
          <p className="text-muted-foreground">{t('dunningEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dunningEntries.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">
                    {entry.customerId ? t('customerLine', { customerId: entry.customerId }) : t('dunningUnknownCustomer')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {environmentDisplayNameById.get(entry.environmentId) ?? entry.environmentId}
                  </span>
                </div>
                <span className="text-destructive">{t(dunningFeedEntryStatusLabelKey(entry.status))}</span>
                <span className="text-muted-foreground">
                  {entry.mrrNormalized === null || entry.currency === null
                    ? t('amountUnknown')
                    : t('mrrLine', { amount: entry.mrrNormalized, currency: entry.currency.toUpperCase() })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {`${t('landedAtLine', { landedAt: entry.landedAt })} · ${t('clientIdLine', { clientId: entry.clientId })}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {dunningTruncated ? t('dunningCapNoteTruncated', { count: dunningEntries.length }) : t('dunningCapNote', { count: dunningEntries.length })}
        </p>
      </section>
    </main>
  );
}
