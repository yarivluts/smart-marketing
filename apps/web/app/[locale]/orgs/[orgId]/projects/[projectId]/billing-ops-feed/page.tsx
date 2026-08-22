import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listEnvironmentsForProject, listOrgProjects, listRecentBillingEventsForProject } from '@/lib/orgs/queries';
import { billingOpsFeedEntryTypeLabelKey, toBillingOpsFeedEntryView } from '@/lib/orgs/billing-ops-view';

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
 * payload is. Dunning-status tracking (the gap doc's stretch goal) is deliberately out of scope — no
 * subscription-lifecycle/dunning model exists yet to attach a status to.
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

  const [projects, rawRecords, environments] = await Promise.all([
    listOrgProjects(orgId),
    listRecentBillingEventsForProject(orgId, projectId),
    listEnvironmentsForProject(orgId, projectId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const entries = rawRecords.map(toBillingOpsFeedEntryView);

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
                <span className="text-xs text-muted-foreground">{t('landedAtLine', { landedAt: entry.landedAt })}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t('capNote', { count: entries.length })}</p>
      </section>
    </main>
  );
}
