import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can, customerEntitySchemaNames } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  evaluateProjectSetupHealth,
  getWarehouseFreshnessForProject,
  getCustomerEntityCoverage,
  listFailedPipelineMessagesForProject,
  listOrchestrationRunsForProject,
  listOrgProjects,
  listQuarantinedRecordsForProject,
  listQueuedPipelineMessagesForProject,
  listRecentIngestBatchesForProject,
  getProjectBackfillOverview,
  listSchemaDefinitionsForProject,
} from '@/lib/orgs/queries';
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
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
import { DismissQuarantinedRecordButton } from '@/components/orgs/dismiss-quarantined-record-button';
import { ReplayQuarantinedRecordButton } from '@/components/orgs/replay-quarantined-record-button';
import { RetryFailedPipelineMessagesButton } from '@/components/orgs/retry-failed-pipeline-messages-button';
import { ReexportRawRecordsButton } from '@/components/orgs/reexport-raw-records-button';
import { SweepQueuedPipelineMessagesButton } from '@/components/orgs/sweep-queued-pipeline-messages-button';
import { TriggerOrchestrationRunButton } from '@/components/orgs/trigger-orchestration-run-button';
import { SetupHealthPanel } from '@/components/orgs/setup-health-panel';
import { BackfillPanel } from '@/components/orgs/backfill-panel';
import { Activity, CheckCircle2, Clock, Inbox, Workflow, XCircle } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard, DonutChart, FlowDiagram, PageHero, type FlowEdgeSpec, type FlowNodeSpec } from '@/components/viz';

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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId, projectId })) {
    notFound();
  }

  // KAN-196: every environment-stamped read below is scoped to the environment picked in the
  // project shell (prod by default). Orchestration runs are project-wide (one dbt refresh covers
  // every environment), so they stay unscoped.
  const { selected: selectedEnvironment, environments } = await resolveSelectedEnvironment(orgId, projectId);
  const environmentId = selectedEnvironment?.id;
  const [projects, batches, quarantinedRecords, failedPipelineMessages, queuedPipelineMessages, orchestrationRuns, warehouseFreshness, setupHealth] = await Promise.all([
    listOrgProjects(orgId),
    listRecentIngestBatchesForProject(orgId, projectId, undefined, environmentId),
    listQuarantinedRecordsForProject(orgId, projectId, undefined, environmentId),
    listFailedPipelineMessagesForProject(orgId, projectId, undefined, environmentId),
    listQueuedPipelineMessagesForProject(orgId, projectId, undefined, environmentId),
    listOrchestrationRunsForProject(orgId, projectId),
    getWarehouseFreshnessForProject({ organizationId: orgId, projectId, environmentId }),
    // KAN-197: requirement statuses for the picked environment only (read-only; derived from records).
    evaluateProjectSetupHealth(orgId, projectId, environmentId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  // The backfill loop (resend pre-existing records) for the picked environment. Configuring it
  // needs project.configure; ingest.write holders who reach this page can follow its progress.
  const canConfigureBackfill = can(bindings, { type: 'user', id: user.id }, 'project.configure', { orgId, projectId });
  const setupFocus = setupHealth?.environments[0];
  const [backfillOverview, schemaDefsForBackfill, customerCoverage] =
    environmentId !== undefined
      ? await Promise.all([
          getProjectBackfillOverview(orgId, projectId, environmentId),
          listSchemaDefinitionsForProject(orgId, projectId),
          // How many customers in events have a customer record - what the backfill hint is based on.
          setupFocus
            ? getCustomerEntityCoverage({ organizationId: orgId, projectId, environmentId, customerEntitySchemas: customerEntitySchemaNames(setupFocus) })
            : Promise.resolve(null),
        ])
      : [null, [], null];
  const backfillSchemas = [...new Map(schemaDefsForBackfill.filter((def) => def.status === 'active' && def.kind !== 'measure').map((def) => [`${def.kind}:${def.name}`, { kind: def.kind, name: def.name }])).values()];

  const now = Date.now();
  const summary = computeIngestHealthSummary(batches.map(toIngestBatchView), now);
  const quarantinedViews = quarantinedRecords.map(toQuarantinedRecordView);
  const queuedPipelineMessageViews = queuedPipelineMessages.map((message) => toQueuedPipelineMessageView(message, now));
  const orchestrationRunViews = orchestrationRuns.map(toOrchestrationRunView);
  const currentFreshness = deriveCurrentFreshness(orchestrationRunViews);

  const t = await getTranslations('IngestHealth');
  const tEnv = await getTranslations('EnvBadge');
  const environmentDisplayNameById = new Map(environments.map((environment) => [environment.id, tEnv(environment.name)]));
  // The environment the warehouse-freshness read is scoped to (the picker's, KAN-196) - named in
  // the copy rather than hard-coding "production", which mislabelled dev records (B16).
  const selectedEnvironmentLabel = tEnv(selectedEnvironment?.name ?? 'prod');

  const numberFormat = new Intl.NumberFormat(locale);
  const overall = summary.overall;
  const base = `/orgs/${orgId}/projects/${projectId}/ingest-health`;
  const warehouseCount = warehouseFreshness.status === 'ok' ? warehouseFreshness.landedRecordCount : null;
  // The pipeline as a graph: every count is one this page already shows below, so the diagram and
  // the detail sections cannot disagree.
  const flowNodes: FlowNodeSpec[] = [
    { id: 'received', label: t('flowReceived'), value: numberFormat.format(overall.totalRecords), sublabel: t('flowReceivedSub', { count: summary.batchesConsidered }), status: overall.totalRecords > 0 ? 'ok' : 'idle' },
    { id: 'accepted', label: t('flowAccepted'), value: numberFormat.format(overall.acceptedCount), status: overall.acceptedCount > 0 ? 'ok' : 'idle' },
    { id: 'quarantined', label: t('flowQuarantined'), value: numberFormat.format(quarantinedViews.length), sublabel: t('flowQuarantinedSub'), status: quarantinedViews.length > 0 ? 'error' : 'ok', href: `${base}#quarantine` },
    { id: 'duplicates', label: t('flowDuplicates'), value: numberFormat.format(overall.duplicateCount), sublabel: t('flowDuplicatesSub'), status: 'idle' },
    {
      id: 'delivery',
      label: t('flowDelivery'),
      sublabel: t('flowDeliverySub', { failed: failedPipelineMessages.length, queued: queuedPipelineMessages.length }),
      status: failedPipelineMessages.length > 0 ? 'error' : queuedPipelineMessages.length > 0 ? 'warn' : overall.acceptedCount > 0 ? 'ok' : 'idle',
      href: `${base}#pipeline`,
    },
    {
      id: 'warehouse',
      label: t('flowWarehouse'),
      value: warehouseCount !== null ? numberFormat.format(warehouseCount) : undefined,
      sublabel: warehouseCount !== null ? t('flowWarehouseSub', { count: warehouseCount }) : t('flowWarehouseUnknown'),
      status: warehouseFreshness.status === 'error' ? 'error' : warehouseCount ? 'ok' : 'idle',
      href: `${base}#orchestration`,
    },
    { id: 'reports', label: t('flowReports'), sublabel: t('flowReportsSub'), status: warehouseCount ? 'ok' : 'idle', href: `/orgs/${orgId}/projects/${projectId}/boards` },
  ];
  const flowEdges: FlowEdgeSpec[] = [
    { source: 'received', target: 'accepted', label: t('flowEdgeValidated'), animated: overall.acceptedCount > 0, status: 'ok' },
    { source: 'received', target: 'quarantined', label: t('flowEdgeRejected'), status: quarantinedViews.length > 0 ? 'error' : 'idle' },
    { source: 'received', target: 'duplicates', label: t('flowEdgeRepeat'), status: 'idle' },
    { source: 'accepted', target: 'delivery', label: t('flowEdgeDelivered'), animated: overall.acceptedCount > 0, status: failedPipelineMessages.length > 0 ? 'error' : 'ok' },
    { source: 'delivery', target: 'warehouse', animated: Boolean(warehouseCount), status: warehouseCount ? 'ok' : 'idle' },
    { source: 'warehouse', target: 'reports', label: t('flowEdgeModelled'), animated: Boolean(warehouseCount), status: warehouseCount ? 'ok' : 'idle' },
  ];

  function renderRollup(rollup: IngestHealthRollup, key: string) {
    return (
      <li key={key} className="flex flex-col gap-1 rounded-xl border border-border bg-background/60 px-4 py-3 text-sm">
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
        {/* The counts above are what happened ON ARRIVAL and never change. Without this line, 47
            probes dismissed long ago kept the page reading as 47 open problems (KAN-201, EasySign). */}
        {rollup.kind === 'overall' && rollup.quarantinedCount > 0 ? (
          <span className="text-muted-foreground">{t('openQuarantineLine', { open: quarantinedViews.length })}</span>
        ) : null}
        <span className="text-muted-foreground">
          {rollup.freshnessMinutes === null
            ? t('neverIngestedLabel')
            : t('freshnessLabel', { minutes: formatMinutesAgo(rollup.freshnessMinutes) })}
        </span>
      </li>
    );
  }

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={Activity} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('heroDescription')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiReceived')} value={numberFormat.format(overall.totalRecords)} icon={Inbox} />
          <StatCard
            title={t('kpiAccepted')}
            value={numberFormat.format(overall.acceptedCount)}
            icon={CheckCircle2}
            progress={overall.totalRecords > 0 ? Math.round((overall.acceptedCount / overall.totalRecords) * 100) : undefined}
          />
          <StatCard title={t('kpiRejectedRate')} value={`${overall.errorRatePercent.toFixed(1)}%`} icon={XCircle} />
          <StatCard
            title={t('kpiLastBatch')}
            value={overall.freshnessMinutes === null ? t('kpiNever') : t('kpiLastBatchValue', { minutes: formatMinutesAgo(overall.freshnessMinutes) })}
            icon={Clock}
          />
        </div>
      </PageHero>

      <ChartCard title={t('flowTitle')} description={t('flowDescription')} icon={Workflow}>
        <FlowDiagram label={t('flowTitle')} nodes={flowNodes} edges={flowEdges} height={360} />
      </ChartCard>

      {environmentId !== undefined && setupHealth?.environments[0] ? (
        <SetupHealthPanel
          health={setupHealth.environments[0]}
          environmentLabel={selectedEnvironmentLabel}
          coverage={customerCoverage?.status === 'ok' ? customerCoverage.coverage : null}
          {...(backfillOverview && canConfigureBackfill ? { backfillHref: '#backfill-heading' } : {})}
        />
      ) : null}

      {environmentId !== undefined && backfillOverview && (canConfigureBackfill || backfillOverview.endpoint) ? (
        <BackfillPanel
          orgId={orgId}
          projectId={projectId}
          environmentId={environmentId}
          environmentLabel={selectedEnvironmentLabel}
          canConfigure={canConfigureBackfill}
          endpoint={backfillOverview.endpoint}
          availableSchemas={backfillSchemas}
          backfills={backfillOverview.backfills.map((backfill) => ({
            backfillId: backfill.backfillId,
            status: backfill.status,
            requestedAt: backfill.requestedAt,
            ...(backfill.failureReason ? { failureReason: backfill.failureReason } : {}),
            ...(backfill.report ? { report: { records_sent: backfill.report.records_sent, batches: backfill.report.batches } } : {}),
            progress: backfill.progress,
          }))}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
          <ChartCard title={t('outcomesTitle')} description={t('outcomesDescription')} icon={CheckCircle2}>
            <DonutChart
              label={t('outcomesTitle')}
              centerValue={numberFormat.format(overall.totalRecords)}
              centerLabel={t('outcomesCenter')}
              data={[
                { label: t('outcomesAccepted'), value: overall.acceptedCount, color: 'hsl(var(--success))' },
                { label: t('outcomesRejected'), value: overall.quarantinedCount, color: 'hsl(var(--destructive))' },
                { label: t('outcomesDuplicate'), value: overall.duplicateCount, color: 'hsl(var(--muted-foreground))' },
              ]}
              size={170}
              layout="stacked"
            />
          </ChartCard>
        <section id="summary" className="flex flex-col gap-3 rounded-2xl lg:col-span-2 border border-border bg-card p-5 shadow-sm">
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
      </div>

      <section id="quarantine" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
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
                  <div className="flex items-start gap-2">
                    <ReplayQuarantinedRecordButton orgId={orgId} projectId={projectId} quarantinedRecordId={record.id} />
                    <DismissQuarantinedRecordButton orgId={orgId} projectId={projectId} quarantinedRecordId={record.id} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t('quarantineCapNote', { count: quarantinedViews.length })}</p>
      </section>

      <section id="pipeline" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('pipelineFailuresHeading')}</h2>
          <div className="flex items-start gap-2">
            {failedPipelineMessages.length > 0 ? (
              <RetryFailedPipelineMessagesButton orgId={orgId} projectId={projectId} />
            ) : null}
            <ReexportRawRecordsButton orgId={orgId} projectId={projectId} />
          </div>
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

      <section id="queued" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('queuedMessagesHeading')}</h2>
          {queuedPipelineMessageViews.length > 0 ? (
            <SweepQueuedPipelineMessagesButton orgId={orgId} projectId={projectId} />
          ) : null}
        </div>
        {queuedPipelineMessageViews.length === 0 ? (
          <p className="text-muted-foreground">{t('noQueuedMessages')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {queuedPipelineMessageViews.map((message) => (
              <li key={message.id} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
                <span className="font-medium">
                  {t('queuedMessageSummary', {
                    clientId: message.clientId,
                    kind: t(message.kind),
                    environment: environmentDisplayNameById.get(message.environmentId) ?? message.environmentId,
                    minutes: formatMinutesAgo(message.minutesAgo),
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="orchestration" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('orchestrationHeading')}</h2>
          <TriggerOrchestrationRunButton orgId={orgId} projectId={projectId} />
        </div>

        {/* Live warehouse freshness (KAN-38 follow-up): read from the real
          warehouse itself, so it reflects EVERY refresh mechanism — the
          hourly scheduled dbt-refresh Cloud Run Job included — not just the
          in-app "Run now" history below, which only tracks its own runs
          (session-B QA, 2026-08-20: this panel looked permanently empty
          while the scheduled refresh ran like clockwork). */}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t('warehouseFreshnessHeading')}</h3>
          {warehouseFreshness.status === 'ok' ? (
            <p className="text-sm text-muted-foreground">
              {warehouseFreshness.latestLandedAt
                ? t('warehouseFreshnessLine', {
                    latestLandedAt: warehouseFreshness.latestLandedAt,
                    count: warehouseFreshness.landedRecordCount,
                    environment: selectedEnvironmentLabel,
                  })
                : t('warehouseFreshnessEmpty', { environment: selectedEnvironmentLabel })}
            </p>
          ) : warehouseFreshness.status === 'not_configured' ? (
            <p className="text-sm text-muted-foreground">{t('warehouseFreshnessNotConfigured')}</p>
          ) : (
            <p className="text-sm text-destructive">{t('warehouseFreshnessError', { message: warehouseFreshness.message })}</p>
          )}
        </div>

        {orchestrationRunViews.length > 0 ? (
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
        ) : null}

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
