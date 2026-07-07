import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listEnvironmentsForProject, listOrgProjects, listRecentIngestBatchesForProject } from '@/lib/orgs/queries';
import {
  computeIngestHealthSummary,
  formatMinutesAgo,
  formatThroughput,
  toIngestBatchView,
  type IngestHealthRollup,
} from '@/lib/orgs/ingest-health-view';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'IngestHealth' });
  return { title: t('metaTitle') };
}

/**
 * A project's ingest health (KAN-35): throughput/error-rate/freshness rolled
 * up from its most recent ingest batches, plus a quarantine browser listing
 * individual quarantined records. Gated on `ingest.write`, same "whole
 * feature, not just mutation, is admin-only" posture as KAN-30/31's pages —
 * this rollup exposes per-record rejection reasons, which is operationally
 * sensitive the same way a schema's field list is.
 *
 * No replay action yet: `IngestBatchModel.record_results` only ever stored
 * validation status, never the raw payload (see KAN-32's own note), so
 * there's nothing to resubmit until KAN-33/34 land a durable raw-payload
 * store. The quarantine browser is read-only until then.
 */
export default async function IngestHealthPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fingest-health`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId })) {
    notFound();
  }

  const [projects, batches, environments] = await Promise.all([
    listOrgProjects(orgId),
    listRecentIngestBatchesForProject(orgId, projectId),
    listEnvironmentsForProject(orgId, projectId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const summary = computeIngestHealthSummary(batches.map(toIngestBatchView), Date.now());

  const t = await getTranslations('IngestHealth');
  const tEnv = await getTranslations('EnvBadge');
  const environmentDisplayNameById = new Map(environments.map((environment) => [environment.id, tEnv(environment.name)]));

  function renderRollup(rollup: IngestHealthRollup, key: string) {
    return (
      <li key={key} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
        <span className="font-medium">{rollup.kind === 'overall' ? t('overallHeading') : t(rollup.kind)}</span>
        <span className="text-muted-foreground">
          {t('countsLine', {
            total: rollup.totalRecords,
            accepted: rollup.acceptedCount,
            quarantined: rollup.quarantinedCount,
            duplicate: rollup.duplicateCount,
          })}
        </span>
        <span className="text-muted-foreground">
          {t('rateLine', { percent: rollup.errorRatePercent.toFixed(1), perMinute: formatThroughput(rollup.throughputPerMinute) })}
        </span>
        <span className="text-muted-foreground">
          {rollup.freshnessMinutes === null
            ? t('neverIngestedLabel')
            : t('freshnessLabel', { minutes: formatMinutesAgo(rollup.freshnessMinutes) })}
        </span>
      </li>
    );
  }

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('summaryHeading')}</h2>
        {batches.length === 0 ? (
          <p className="text-muted-foreground">{t('noBatches')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {renderRollup(summary.overall, 'overall')}
            {summary.byKind.map((rollup) => renderRollup(rollup, rollup.kind))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t('batchCapNote', { count: summary.batchesConsidered })}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('quarantineHeading')}</h2>
        <p className="text-sm text-muted-foreground">{t('replayUnavailableNote')}</p>
        {summary.quarantinedRecords.length === 0 ? (
          <p className="text-muted-foreground">{t('noQuarantinedRecords')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {summary.quarantinedRecords.map((record) => (
              <li
                key={`${record.batchId}:${record.recordIndex}`}
                className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm"
              >
                <span className="font-medium">
                  {t('quarantinedRecordSummary', {
                    clientId: record.clientId,
                    kind: t(record.kind),
                    environment: environmentDisplayNameById.get(record.environmentId) ?? record.environmentId,
                  })}
                </span>
                <span className="text-muted-foreground">{t('reasonsLabel', { reasons: record.reasons.join(', ') })}</span>
              </li>
            ))}
          </ul>
        )}
        {summary.quarantinedRecordsTruncated ? <p className="text-xs text-muted-foreground">{t('quarantineTruncatedNote')}</p> : null}
      </section>
    </main>
  );
}
