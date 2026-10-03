import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { Activity, ShieldAlert, AlertTriangle, Clock, Database, CheckCircle2, Radio, Server } from 'lucide-react';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  getWarehouseFreshnessForProject,
  listEnvironmentsForProject,
  listFailedPipelineMessagesForProject,
  listOrchestrationRunsForProject,
  listOrgProjects,
  listQuarantinedRecordsForProject,
  listQueuedPipelineMessagesForProject,
  listRecentIngestBatchesForProject,
} from '@/lib/orgs/queries';
import {
  computeIngestHealthSummary,
  formatMinutesAgo,
  formatThroughput,
  toIngestBatchView,
  toQuarantinedRecordView,
  toQueuedPipelineMessageView,
  type IngestHealthRollup,
} from '@/lib/orgs/ingest-health-view';
import {
  deriveCurrentFreshness,
  freshnessTableLabelKey,
  runStatusLabelKey,
  toOrchestrationRunView,
  type OrchestrationRunView,
} from '@/lib/orgs/orchestration-view';
import {
  PpPage,
  PpPageHeader,
  PpKpiGrid,
  PpKpiCard,
  PpCard,
  PpPill,
  PpEmptyState,
} from '@/components/pastel/primitives';
import { DismissQuarantinedRecordButton } from '@/components/orgs/dismiss-quarantined-record-button';
import { ReplayQuarantinedRecordButton } from '@/components/orgs/replay-quarantined-record-button';
import { RetryFailedPipelineMessagesButton } from '@/components/orgs/retry-failed-pipeline-messages-button';
import { SweepQueuedPipelineMessagesButton } from '@/components/orgs/sweep-queued-pipeline-messages-button';
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

  const [
    projects,
    batches,
    environments,
    quarantinedRecords,
    failedPipelineMessages,
    queuedPipelineMessages,
    orchestrationRuns,
    warehouseFreshness,
  ] = await Promise.all([
    listOrgProjects(orgId),
    listRecentIngestBatchesForProject(orgId, projectId),
    listEnvironmentsForProject(orgId, projectId),
    listQuarantinedRecordsForProject(orgId, projectId),
    listFailedPipelineMessagesForProject(orgId, projectId),
    listQueuedPipelineMessagesForProject(orgId, projectId),
    listOrchestrationRunsForProject(orgId, projectId),
    getWarehouseFreshnessForProject({ organizationId: orgId, projectId }),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/ingest-health`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const now = Date.now();
  const summary = computeIngestHealthSummary(batches.map(toIngestBatchView), now);
  const quarantinedViews = quarantinedRecords.map(toQuarantinedRecordView);
  const queuedPipelineMessageViews = queuedPipelineMessages.map((message) => toQueuedPipelineMessageView(message, now));
  const orchestrationRunViews = orchestrationRuns.map(toOrchestrationRunView);
  const currentFreshness = deriveCurrentFreshness(orchestrationRunViews);

  const t = await getTranslations('IngestHealth');
  const tEnv = await getTranslations('EnvBadge');
  const environmentDisplayNameById = new Map(environments.map((environment) => [environment.id, tEnv(environment.name)]));

  function renderRollupCard(rollup: IngestHealthRollup, key: string) {
    return (
      <div
        key={key}
        className="flex flex-col gap-2 rounded-2xl bg-pp-surface-container-low/60 border border-pp-outline-variant/20 p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-pp-body-md text-pp-on-surface">
            {rollup.kind === 'overall' ? t('overallHeading') : t(rollup.kind)}
          </span>
          <PpPill accent={rollup.errorRatePercent > 5 ? 'error' : rollup.errorRatePercent > 0 ? 'amber' : 'mint'}>
            {rollup.errorRatePercent.toFixed(1)}% error
          </PpPill>
        </div>
        <div className="text-xs text-pp-on-surface-variant">
          {t('countsLine', {
            total: rollup.totalRecords,
            accepted: rollup.acceptedCount,
            quarantined: rollup.quarantinedCount,
            duplicate: rollup.duplicateCount,
          })}
        </div>
        <div className="flex items-center justify-between text-xs text-pp-outline pt-1 border-t border-pp-outline-variant/15">
          <span>{formatThroughput(rollup.throughputPerMinute)} rec/min</span>
          <span>
            {rollup.freshnessMinutes === null
              ? t('neverIngestedLabel')
              : t('freshnessLabel', { minutes: formatMinutesAgo(rollup.freshnessMinutes) })}
          </span>
        </div>
      </div>
    );
  }

  const integrityPct = Math.max(0, 100 - summary.overall.errorRatePercent).toFixed(1);

  return (
    <PpPage>
      <PpPageHeader
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        description={t('description')}
      />

      <PpKpiGrid>
        <PpKpiCard
          label={t('kpiThroughput')}
          value={formatThroughput(summary.overall.throughputPerMinute)}
          valueSuffix="rec/m"
          accent="primary"
        />
        <PpKpiCard
          label={t('kpiDelivered')}
          value={summary.overall.acceptedCount.toLocaleString()}
          valueSuffix={`/ ${summary.overall.totalRecords.toLocaleString()}`}
          accent="mint"
        />
        <PpKpiCard
          label={t('kpiIntegrity')}
          value={`${integrityPct}%`}
          accent={summary.overall.errorRatePercent > 5 ? 'error' : 'mint'}
        />
        <PpKpiCard
          label={t('kpiFreshness')}
          value={
            summary.overall.freshnessMinutes !== null
              ? formatMinutesAgo(summary.overall.freshnessMinutes)
              : t('neverIngestedLabel')
          }
          accent="neutral"
        />
      </PpKpiGrid>

      {/* Summary & Ingestion Batches Overview */}
      <PpCard
        title={t('summaryHeading')}
        subtitle={t('batchCapNote', { count: summary.batchesConsidered })}
        icon={Activity}
        iconAccent="primary"
      >
        {batches.length === 0 ? (
          <PpEmptyState
            icon={Activity}
            title={t('noBatches')}
            description={t('noBatchesDesc')}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {renderRollupCard(summary.overall, 'overall')}
            {summary.byKind.map((rollup) => renderRollupCard(rollup, rollup.kind))}
          </div>
        )}
      </PpCard>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Quarantine Browser (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <PpCard
            title={t('quarantineHeading')}
            subtitle={t('quarantineCapNote', { count: quarantinedViews.length })}
            icon={ShieldAlert}
            iconAccent="amber"
            action={
              quarantinedViews.length > 0 ? (
                <PpPill accent="amber">{quarantinedViews.length} Quarantined</PpPill>
              ) : undefined
            }
          >
            {quarantinedViews.length === 0 ? (
              <PpEmptyState
                icon={CheckCircle2}
                title={t('noQuarantinedRecords')}
                description={t('noQuarantinedDesc')}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {quarantinedViews.map((record) => (
                  <div
                    key={record.id}
                    className="p-4 rounded-2xl bg-pp-surface-container-low/60 border border-pp-outline-variant/20 flex flex-col gap-2.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-pp-body-md text-pp-on-surface">
                            {t('quarantinedRecordSummary', {
                              clientId: record.clientId,
                              kind: t(record.kind),
                              environment: environmentDisplayNameById.get(record.environmentId) ?? record.environmentId,
                            })}
                          </span>
                        </div>
                        <span className="text-xs text-pp-error font-medium">
                          {t('reasonsLabel', { reasons: record.reasons.join(', ') })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <ReplayQuarantinedRecordButton
                          orgId={orgId}
                          projectId={projectId}
                          quarantinedRecordId={record.id}
                        />
                        <DismissQuarantinedRecordButton
                          orgId={orgId}
                          projectId={projectId}
                          quarantinedRecordId={record.id}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PpCard>
        </div>

        {/* Right Column: Pipeline Failures & Queued Messages (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Pipeline delivery failures (DLQ) */}
          <PpCard
            title={t('pipelineFailuresHeading')}
            subtitle={failedPipelineMessages.length > 0 ? undefined : t('noPipelineFailuresDesc')}
            icon={AlertTriangle}
            iconAccent="error"
            action={
              failedPipelineMessages.length > 0 ? (
                <RetryFailedPipelineMessagesButton orgId={orgId} projectId={projectId} />
              ) : undefined
            }
          >
            {failedPipelineMessages.length === 0 ? (
              <PpEmptyState
                icon={CheckCircle2}
                title={t('noPipelineFailures')}
                description={t('noPipelineFailuresDesc')}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {failedPipelineMessages.map((message) => (
                  <div
                    key={message.id}
                    className="p-3.5 rounded-2xl bg-pp-surface-container-low/60 border border-pp-outline-variant/20 flex flex-col gap-1"
                  >
                    <span className="font-medium text-xs text-pp-on-surface">
                      {t('pipelineFailureSummary', {
                        clientId: message.client_id,
                        kind: t(message.kind),
                        environment: environmentDisplayNameById.get(message.environment_id) ?? message.environment_id,
                        reason: message.failure_reason ?? '',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </PpCard>

          {/* Stuck Queued Messages */}
          <PpCard
            title={t('queuedMessagesHeading')}
            subtitle={queuedPipelineMessageViews.length > 0 ? undefined : t('noQueuedMessagesDesc')}
            icon={Clock}
            iconAccent="neutral"
            action={
              queuedPipelineMessageViews.length > 0 ? (
                <SweepQueuedPipelineMessagesButton orgId={orgId} projectId={projectId} />
              ) : undefined
            }
          >
            {queuedPipelineMessageViews.length === 0 ? (
              <PpEmptyState
                icon={CheckCircle2}
                title={t('noQueuedMessages')}
                description={t('noQueuedMessagesDesc')}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {queuedPipelineMessageViews.map((message) => (
                  <div
                    key={message.id}
                    className="p-3.5 rounded-2xl bg-pp-surface-container-low/60 border border-pp-outline-variant/20 flex flex-col gap-1"
                  >
                    <span className="font-medium text-xs text-pp-on-surface">
                      {t('queuedMessageSummary', {
                        clientId: message.clientId,
                        kind: t(message.kind),
                        environment: environmentDisplayNameById.get(message.environmentId) ?? message.environmentId,
                        minutes: formatMinutesAgo(message.minutesAgo),
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </PpCard>
        </div>
      </div>

      {/* Orchestration & Warehouse Mart Freshness */}
      <PpCard
        title={t('orchestrationHeading')}
        subtitle={t('warehouseFreshnessHeading')}
        icon={Database}
        iconAccent="primary"
        action={<TriggerOrchestrationRunButton orgId={orgId} projectId={projectId} />}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Warehouse Freshness Card */}
          <div className="p-4 rounded-2xl bg-pp-surface-container-low/60 border border-pp-outline-variant/20 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-pp-primary" />
              <h3 className="text-sm font-semibold text-pp-on-surface">{t('warehouseFreshnessHeading')}</h3>
            </div>
            {warehouseFreshness.status === 'ok' ? (
              <p className="text-xs text-pp-on-surface-variant">
                {warehouseFreshness.latestLandedAt
                  ? t('warehouseFreshnessLine', {
                      latestLandedAt: warehouseFreshness.latestLandedAt,
                      count: warehouseFreshness.landedRecordCount,
                    })
                  : t('warehouseFreshnessEmpty')}
              </p>
            ) : warehouseFreshness.status === 'not_configured' ? (
              <p className="text-xs text-pp-outline">{t('warehouseFreshnessNotConfigured')}</p>
            ) : (
              <p className="text-xs text-pp-error font-medium">
                {t('warehouseFreshnessError', { message: warehouseFreshness.message })}
              </p>
            )}
          </div>

          {/* Current Table Freshness */}
          <div className="p-4 rounded-2xl bg-pp-surface-container-low/60 border border-pp-outline-variant/20 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-pp-on-surface">{t('orchestrationFreshnessHeading')}</h3>
            {currentFreshness?.freshness && currentFreshness.freshness.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {currentFreshness.freshness.map((entry) => (
                  <li key={entry.table} className="text-xs text-pp-on-surface-variant flex items-center justify-between">
                    <span className="font-mono font-medium">{t(freshnessTableLabelKey(entry.table))}</span>
                    <span className="text-pp-outline">
                      {entry.rowCount.toLocaleString()} rows · {entry.latestRecordAt ?? t('orchestrationNeverLanded')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-pp-outline">{t('orchestrationNoFreshnessYet')}</p>
            )}
          </div>

          {/* Orchestration History */}
          <div className="p-4 rounded-2xl bg-pp-surface-container-low/60 border border-pp-outline-variant/20 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-pp-on-surface">{t('orchestrationHistoryHeading')}</h3>
            {orchestrationRunViews.length === 0 ? (
              <p className="text-xs text-pp-outline">{t('orchestrationNoRuns')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {orchestrationRunViews.slice(0, 5).map((run: OrchestrationRunView) => (
                  <li
                    key={run.id}
                    className="flex flex-col gap-1 p-2.5 rounded-xl bg-pp-surface-container-lowest/80 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-pp-on-surface font-medium">{run.startedAt}</span>
                      <PpPill
                        accent={
                          run.status === 'succeeded' ? 'mint' : run.status === 'failed' ? 'error' : 'primary'
                        }
                      >
                        {t(runStatusLabelKey(run.status))}
                      </PpPill>
                    </div>
                    {run.errorMessage ? (
                      <span className="text-pp-error font-medium">
                        {t('orchestrationRunError', { message: run.errorMessage })}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </PpCard>
    </PpPage>
  );
}
