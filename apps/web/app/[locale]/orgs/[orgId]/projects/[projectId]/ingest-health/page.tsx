import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listEnvironmentsForProject,
  listFailedPipelineMessagesForProject,
  listOrchestrationRunsForProject,
  listOrgProjects,
  listQuarantinedRecordsForProject,
  listRecentIngestBatchesForProject,
} from '@/lib/orgs/queries';
import {
  computeIngestHealthSummary,
  formatMinutesAgo,
  formatThroughput,
  toIngestBatchView,
  toQuarantinedRecordView,
  type IngestHealthRollup,
} from '@/lib/orgs/ingest-health-view';
import {
  deriveCurrentFreshness,
  freshnessTableLabelKey,
  runStatusLabelKey,
  toOrchestrationRunView,
  type OrchestrationRunView,
} from '@/lib/orgs/orchestration-view';
import { ReplayQuarantinedRecordButton } from '@/components/orgs/replay-quarantined-record-button';
import { RetryFailedPipelineMessagesButton } from '@/components/orgs/retry-failed-pipeline-messages-button';
import { TriggerOrchestrationRunButton } from '@/components/orgs/trigger-orchestration-run-button';

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
 * up from its most recent ingest batches, plus a quarantine browser and a
 * pipeline-delivery-failures browser, each with a replay action (KAN-34).
 * Gated on `ingest.write`, same "whole feature, not just mutation, is
 * admin-only" posture as KAN-30/31's pages — this rollup exposes per-record
 * rejection reasons, which is operationally sensitive the same way a
 * schema's field list is.
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

  const [projects, batches, environments, quarantinedRecords, failedPipelineMessages, orchestrationRuns] = await Promise.all([
    listOrgProjects(orgId),
    listRecentIngestBatchesForProject(orgId, projectId),
    listEnvironmentsForProject(orgId, projectId),
    listQuarantinedRecordsForProject(orgId, projectId),
    listFailedPipelineMessagesForProject(orgId, projectId),
    listOrchestrationRunsForProject(orgId, projectId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const summary = computeIngestHealthSummary(batches.map(toIngestBatchView), Date.now());
  const quarantinedViews = quarantinedRecords.map(toQuarantinedRecordView);
  const orchestrationRunViews = orchestrationRuns.map(toOrchestrationRunView);
  const currentFreshness = deriveCurrentFreshness(orchestrationRunViews);

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
        {quarantinedViews.length === 0 ? (
          <p className="text-muted-foreground">{t('noQuarantinedRecords')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {quarantinedViews.map((record) => (
              <li key={record.id} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">
                      {t('quarantinedRecordSummary', {
                        clientId: record.clientId,
                        kind: t(record.kind),
                        environment: environmentDisplayNameById.get(record.environmentId) ?? record.environmentId,
                      })}
                    </span>
                    <span className="text-muted-foreground">{t('reasonsLabel', { reasons: record.reasons.join(', ') })}</span>
                  </div>
                  <ReplayQuarantinedRecordButton orgId={orgId} projectId={projectId} quarantinedRecordId={record.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t('quarantineCapNote', { count: quarantinedViews.length })}</p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('pipelineFailuresHeading')}</h2>
          {failedPipelineMessages.length > 0 ? (
            <RetryFailedPipelineMessagesButton orgId={orgId} projectId={projectId} />
          ) : null}
        </div>
        {failedPipelineMessages.length === 0 ? (
          <p className="text-muted-foreground">{t('noPipelineFailures')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {failedPipelineMessages.map((message) => (
              <li key={message.id} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
                <span className="font-medium">
                  {t('pipelineFailureSummary', {
                    clientId: message.client_id,
                    kind: t(message.kind),
                    environment: environmentDisplayNameById.get(message.environment_id) ?? message.environment_id,
                    reason: message.failure_reason ?? '',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('orchestrationHeading')}</h2>
          <TriggerOrchestrationRunButton orgId={orgId} projectId={projectId} />
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t('orchestrationFreshnessHeading')}</h3>
          {currentFreshness?.freshness ? (
            <ul className="flex flex-col gap-1">
              {currentFreshness.freshness.map((entry) => (
                <li key={entry.table} className="text-sm text-muted-foreground">
                  {t('orchestrationFreshnessRow', {
                    table: t(freshnessTableLabelKey(entry.table)),
                    count: entry.rowCount,
                    freshness: entry.latestRecordAt ?? t('orchestrationNeverLanded'),
                  })}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{t('orchestrationNoFreshnessYet')}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t('orchestrationHistoryHeading')}</h3>
          {orchestrationRunViews.length === 0 ? (
            <p className="text-muted-foreground">{t('orchestrationNoRuns')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {orchestrationRunViews.map((run: OrchestrationRunView) => (
                <li key={run.id} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
                  <span className="font-medium">
                    {t('orchestrationRunSummary', { status: t(runStatusLabelKey(run.status)), startedAt: run.startedAt })}
                  </span>
                  {run.errorMessage ? (
                    <span className="text-xs text-destructive">{t('orchestrationRunError', { message: run.errorMessage })}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
