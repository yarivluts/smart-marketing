import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  checkProjectQueryQuota,
  getActiveAutomationGuardrailPolicy,
  getAutomationKillSwitchStatus,
  getProjectCostQuota,
  listAutomationActionsForProject,
  listOrgProjects,
  listPluginInstallsForProject,
  listQueryCostLogEntriesForProject,
} from '@/lib/orgs/queries';
import { formatEstimatedCostUsd, formatLabels, outcomeLabelKey, toProjectCostQuotaView, toQueryCostLogEntryView } from '@/lib/orgs/cost-guardrail-view';
import { SetCostQuotaForm } from '@/components/orgs/set-cost-quota-form';
import { AutomationKillSwitchPanel } from '@/components/orgs/automation-kill-switch-panel';
import {
  PpPage,
  PpPageHeader,
  PpKpiGrid,
  PpKpiCard,
  PpCard,
  PpTable,
  PpEmptyState,
  PpPill,
} from '@/components/pastel/primitives';
import { Flame, Database, Activity, ShieldCheck, ShieldAlert } from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'CostGuardrails' });
  return { title: t('metaTitle') };
}

/**
 * A project's KAN-39 cost guardrails:
 * Daily query quota + labels, usage against quota, query cost log, and emergency circuit breaker.
 *
 * Converted to Stitch Pastel Pulse layout (desktop 389d9edf, mobile b6efd552).
 * When engaging the kill switch, a reason is strictly required.
 */
export default async function CostGuardrailsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fcost-guardrails`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'project.manage', { orgId })) {
    notFound();
  }

  const [
    projects,
    quota,
    logEntries,
    killSwitchStatus,
    guardrailPolicy,
    interventions,
    installs,
  ] = await Promise.all([
    listOrgProjects(orgId),
    getProjectCostQuota(orgId, projectId),
    listQueryCostLogEntriesForProject(orgId, projectId),
    getAutomationKillSwitchStatus(orgId).catch(() => ({ engaged: false })),
    getActiveAutomationGuardrailPolicy(orgId, projectId).catch(() => null),
    listAutomationActionsForProject(orgId, projectId, 20).catch(() => []),
    listPluginInstallsForProject(orgId, projectId).catch(() => []),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/cost-guardrails`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const isHalted = Boolean(killSwitchStatus && killSwitchStatus.engaged);

  // Passes the quota already fetched above so this doesn't re-read the same ProjectCostQuotaModel doc a second time.
  const quotaStatus = await checkProjectQueryQuota(orgId, projectId, quota);
  const quotaView = toProjectCostQuotaView(quota);
  const logViews = logEntries.map(toQueryCostLogEntryView);

  const t = await getTranslations('CostGuardrails');

  return (
    <PpPage>
      {/* 1. Header */}
      <PpPageHeader
        eyebrow="COST GUARDRAILS & PACING"
        meta={isHalted ? 'Emergency Circuit Breaker Engaged' : 'Query & Spend Guardrails Active'}
        title={t('title', { projectName: project.name })}
        description={t('usageHeading')}
        actions={
          <div className="flex items-center gap-2">
            {isHalted ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pp-error-container px-3 py-1.5 text-xs font-bold text-pp-error shadow-pp-candy">
                <Flame className="h-4 w-4" aria-hidden="true" />
                <span>KILL SWITCH ACTIVE</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pp-secondary-container/60 px-3 py-1.5 text-xs font-semibold text-pp-secondary">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <span>Safe Operations</span>
              </span>
            )}
          </div>
        }
      />

      {/* 2. Top KPI Deck */}
      <PpKpiGrid>
        <PpKpiCard
          label="Daily Query Quota"
          value={quotaStatus.attemptedToday}
          valueSuffix={quotaStatus.limit !== null ? `/ ${quotaStatus.limit}` : ''}
          accent="primary"
          footer={
            quotaStatus.remaining !== null
              ? `${quotaStatus.remaining} queries remaining today`
              : 'Unlimited quota configured'
          }
        />
        <PpKpiCard
          label="Query Cost Logs"
          value={logViews.length}
          valueSuffix="runs"
          accent="mint"
          footer="Audited BigQuery calls"
        />
        <PpKpiCard
          label="Spend Ceiling"
          value={guardrailPolicy?.spendCeilingUsd ? `$${guardrailPolicy.spendCeilingUsd.toLocaleString()}` : '—'}
          accent="amber"
          footer="Global Daily Ad Spend Cap"
        />
        <PpKpiCard
          label="Emergency Circuit Breaker"
          value={isHalted ? 'Halted' : 'Guarded'}
          badge={isHalted ? 'PAUSED' : 'ACTIVE'}
          badgeAccent={isHalted ? 'error' : 'mint'}
          accent={isHalted ? 'error' : 'sky'}
          footer={isHalted ? ('reason' in killSwitchStatus && killSwitchStatus.reason ? killSwitchStatus.reason : 'Emergency Halt Active') : '0 Anomalies Detected'}
        />
      </PpKpiGrid>

      {/* 3. Section 1: Emergency Kill Switch Panel */}
      <PpCard
        title={t('killSwitchHeading', { defaultValue: 'Emergency Circuit Breaker' })}
        subtitle="Halt all automated mutations and optimization actions across channels (requires explicit reason)"
        icon={Flame}
        iconAccent={isHalted ? 'error' : 'primary'}
      >
        <AutomationKillSwitchPanel orgId={orgId} status={killSwitchStatus} />
      </PpCard>

      {/* 4. Section 2: BigQuery Daily Query Quota Settings */}
      <PpCard
        title={t('setQuotaHeading')}
        subtitle={t('usageLine', {
          attempted: quotaStatus.attemptedToday,
          limit: quotaStatus.limit ?? '—',
          remaining: quotaStatus.remaining ?? '—',
        })}
        icon={Database}
        iconAccent="primary"
      >
        <div className="space-y-4">
          <div className="rounded-2xl bg-pp-subtle-inset p-4 text-xs space-y-1">
            {quotaView.setAt ? (
              <p className="text-pp-on-surface-variant font-medium">
                {t('labelsCurrent', { labels: formatLabels(quotaView.labels) || t('noLabels') })}
              </p>
            ) : (
              <p className="text-pp-outline">{t('defaultQuotaNote')}</p>
            )}
          </div>
          <SetCostQuotaForm
            orgId={orgId}
            projectId={projectId}
            dailyQueryLimit={quotaView.dailyQueryLimit}
            labels={quotaView.labels}
          />
        </div>
      </PpCard>

      {/* 5. Section 3: Query Cost Audit Log */}
      <PpCard
        title={t('logHeading')}
        subtitle="Non-cached query executions with recorded compute metrics"
        icon={Activity}
        iconAccent="mint"
        flush={logViews.length > 0}
      >
        {logViews.length === 0 ? (
          <PpEmptyState
            icon={Activity}
            title={t('logHeading')}
            description={t('noLogEntries')}
          />
        ) : (
          <PpTable>
            <thead>
              <tr>
                <th>Outcome</th>
                <th>Estimated Cost</th>
                <th>Executed At</th>
                <th>Definition References</th>
              </tr>
            </thead>
            <tbody>
              {logViews.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <PpPill
                      accent={
                        entry.outcome === 'executed'
                          ? 'mint'
                          : entry.outcome === 'blocked_quota_exceeded'
                            ? 'error'
                            : 'amber'
                      }
                      dot
                    >
                      {t(outcomeLabelKey(entry.outcome))}
                    </PpPill>
                  </td>
                  <td className="font-mono tabular-nums font-semibold text-pp-on-surface">
                    {formatEstimatedCostUsd(entry.estimatedCostUsd ?? 0)}
                  </td>
                  <td className="text-pp-outline font-mono text-xs">
                    {entry.executedAt}
                  </td>
                  <td className="text-pp-body-sm text-pp-on-surface-variant">
                    {Object.keys(entry.definitionRefs).length > 0 ? (
                      <span className="font-mono text-xs">
                        {Object.entries(entry.definitionRefs)
                          .map(([kind, id]) => `${kind}:${id}`)
                          .join(', ')}
                      </span>
                    ) : (
                      <span className="text-pp-outline">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </PpTable>
        )}
      </PpCard>
    </PpPage>
  );
}
