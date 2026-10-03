import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  getPaybackOverviewForProject,
  listOrgProjects,
  listPluginInstallsForProject,
  queryCohortRetention,
} from '@/lib/orgs/queries';
import { buildCohortRetentionView } from '@/lib/orgs/cohort-retention-view';
import { Link } from '@/i18n/navigation';
import { MissingIntegrationAlert } from '@/components/integrations/missing-integration-alert';
import {
  PpPage,
  PpPageHeader,
  PpKpiGrid,
  PpKpiCard,
  PpCard,
  PpTable,
  PpEmptyState,
  PpPill,
  PpButton,
  ppInputClass,
} from '@/components/pastel/primitives';
import { Users, Calendar, Filter, TrendingUp, Sparkles, Database } from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
  searchParams: Promise<{ conversionEvent?: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'CohortRetention' });
  return { title: t('metaTitle') };
}

/**
 * A project's monthly-cohort retention matrix (KAN-113 & KAN-118):
 * Evaluates monthly cohorts across period numbers, optionally narrowed by `conversionEvent`.
 *
 * Converted to Stitch Pastel Pulse design (desktop 70775cd4 / 39d726ea, mobile 082f05ea / 89f3a829),
 * rendering the real warehouse retention matrix and payback data without fabricated metrics.
 */
export default async function CohortRetentionPage({ params, searchParams }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  const { conversionEvent: conversionEventParam } = await searchParams;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fcohorts`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId })) {
    notFound();
  }

  const trimmedConversionEvent = conversionEventParam?.trim();
  const [projects, cohortOutcomeRaw, paybackOutcome, installs] = await Promise.all([
    listOrgProjects(orgId),
    queryCohortRetention(orgId, projectId, trimmedConversionEvent ? { conversionEvent: trimmedConversionEvent } : undefined).catch(() => ({ ok: false as const, reason: 'warehouse_not_configured' as const, message: '' })),
    getPaybackOverviewForProject(orgId, projectId).catch(() => null),
    listPluginInstallsForProject(orgId, projectId).catch(() => []),
  ]);

  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/cohorts`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const view = buildCohortRetentionView(cohortOutcomeRaw);

  const hasCohortData = view.kind === 'ok' && view.cohorts.length > 0;
  const hasPaybackData = Boolean(paybackOutcome && paybackOutcome.ok && paybackOutcome.windows.length > 0);

  const t = await getTranslations('CohortRetention');

  // Discover all distinct period numbers across all cohorts for the table columns
  const allPeriodNumbers: number[] = [];
  if (view.kind === 'ok') {
    const periodSet = new Set<number>();
    for (const c of view.cohorts) {
      for (const p of c.periods) {
        periodSet.add(p.periodNumber);
      }
    }
    allPeriodNumbers.push(...Array.from(periodSet).sort((a, b) => a - b));
  }

  const totalCohortAccounts = view.kind === 'ok' ? view.cohorts.reduce((sum, c) => sum + c.cohortSize, 0) : 0;

  return (
    <PpPage>
      {/* 1. Header */}
      <PpPageHeader
        eyebrow="ECONOMICS & RETENTION"
        meta={hasCohortData ? 'Warehouse Mart Telemetry Live' : 'Awaiting Warehouse Sync'}
        title={t('title', { projectName: project.name })}
        description={t('description')}
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pp-secondary-container/60 px-3 py-1.5 text-xs font-semibold text-pp-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-pp-secondary animate-pulse" />
              <span>{hasCohortData ? 'Live Telemetry' : 'Idle'}</span>
            </span>
          </div>
        }
      />

      {/* 2. Top KPI Deck */}
      <PpKpiGrid>
        <PpKpiCard
          label="Tracked Cohorts"
          value={view.kind === 'ok' ? view.cohorts.length : 0}
          valueSuffix="months"
          accent="primary"
          footer="Monthly acquisition cohorts"
        />
        <PpKpiCard
          label="Cohort Accounts"
          value={totalCohortAccounts.toLocaleString(locale)}
          valueSuffix="signups"
          badge="First-Party"
          badgeAccent="mint"
          accent="mint"
          footer="Total landed users"
        />
        <PpKpiCard
          label="Payback Overview"
          value={paybackOutcome && paybackOutcome.ok ? `${paybackOutcome.windows.length}` : '—'}
          valueSuffix={paybackOutcome && paybackOutcome.ok ? 'windows' : undefined}
          badge={hasPaybackData ? 'Mart Active' : 'No Data'}
          badgeAccent={hasPaybackData ? 'sky' : 'neutral'}
          accent="sky"
          footer="Multi-window realization"
        />
        <PpKpiCard
          label="Warehouse Status"
          value={view.kind === 'ok' ? 'Connected' : view.kind === 'warehouse_not_configured' ? 'Not Configured' : 'Degraded'}
          badge={view.kind === 'ok' ? 'Healthy' : 'Action Req'}
          badgeAccent={view.kind === 'ok' ? 'mint' : 'amber'}
          accent={view.kind === 'ok' ? 'mint' : 'amber'}
          footer="fact_cohort_retention mart"
        />
      </PpKpiGrid>

      {/* 3. Event Filter Form */}
      <PpCard
        title="Conversion Event Scope"
        subtitle="Narrow retention analysis to a specific named conversion event"
        icon={Filter}
        iconAccent="sky"
      >
        <form method="get" className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 space-y-1">
            <label htmlFor="cohort-conversion-event" className="text-xs font-semibold text-pp-on-surface">
              {t('conversionEventLabel')}
            </label>
            <input
              id="cohort-conversion-event"
              name="conversionEvent"
              defaultValue={trimmedConversionEvent ?? ''}
              placeholder={t('conversionEventPlaceholder')}
              className={ppInputClass}
            />
          </div>
          <div className="flex items-center gap-2">
            <PpButton type="submit" variant="primary" size="md">
              {t('filterButton')}
            </PpButton>
            {trimmedConversionEvent && (
              <PpButton asChild variant="ghost" size="md">
                <Link href={{ pathname: `/orgs/${orgId}/projects/${projectId}/cohorts` }}>
                  {t('clearFilterButton')}
                </Link>
              </PpButton>
            )}
          </div>
        </form>
      </PpCard>

      {/* 4. Cohort Retention Matrix Heatmap Table */}
      <PpCard
        title="Monthly Cohort Retention Heatmap"
        subtitle={
          trimmedConversionEvent
            ? `Retention matrix filtered by conversion event: "${trimmedConversionEvent}"`
            : 'Unfiltered retention matrix tracking user activity over month milestones'
        }
        icon={Users}
        iconAccent="primary"
        flush={view.kind === 'ok' && view.cohorts.length > 0}
      >
        {view.kind !== 'ok' ? (
          <div className="space-y-4">
            <MissingIntegrationAlert
              orgId={orgId}
              projectId={projectId}
              connectorId="google_bigquery"
              metricKey="LTV"
              customTitle={t('cohortTableCaption')}
              customMissingPoints={[
                'Warehouse connection or dbt mart generation',
                'fact_cohort_retention table population',
              ]}
              customImpactMetrics={['Long-term retention curves', 'Payback horizon modeling']}
            />
            <p className="text-pp-body-md text-pp-on-surface-variant">
              {view.kind === 'warehouse_not_configured'
                ? t('notConfigured')
                : view.kind === 'quota_exceeded'
                  ? t('quotaExceeded')
                  : t('queryError')}
            </p>
          </div>
        ) : view.cohorts.length === 0 ? (
          <PpEmptyState
            icon={Users}
            title={t('empty')}
            description={t('empty')}
          />
        ) : (
          <PpTable>
            <thead>
              <tr>
                <th>{t('cohortColumnHeading')}</th>
                <th>{t('cohortSizeColumnHeading')}</th>
                {allPeriodNumbers.map((pNum) => (
                  <th key={pNum} className="text-center">
                    M{pNum}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.cohorts.map((cohort) => {
                const periodsByNum = new Map(cohort.periods.map((p) => [p.periodNumber, p]));
                return (
                  <tr key={cohort.cohortMonth}>
                    <td className="font-semibold text-pp-on-surface font-mono">
                      {cohort.cohortMonth}
                    </td>
                    <td className="tabular-nums font-mono text-pp-on-surface font-semibold">
                      {cohort.cohortSize.toLocaleString(locale)}
                    </td>
                    {allPeriodNumbers.map((pNum) => {
                      const period = periodsByNum.get(pNum);
                      if (!period) {
                        return (
                          <td key={pNum} className="text-center text-pp-outline font-mono">
                            —
                          </td>
                        );
                      }
                      const rate = period.retentionRatePercent;
                      const cellBg =
                        rate >= 70
                          ? 'bg-pp-primary text-pp-on-primary font-bold'
                          : rate >= 40
                            ? 'bg-pp-primary-fixed text-pp-on-primary-fixed font-semibold'
                            : rate >= 20
                              ? 'bg-pp-secondary-container text-pp-secondary font-medium'
                              : rate > 0
                                ? 'bg-pp-surface-container text-pp-on-surface font-normal'
                                : 'text-pp-outline';

                      return (
                        <td key={pNum} className="p-1 text-center">
                          <span
                            className={`inline-block w-14 py-1 rounded-lg text-xs font-mono tabular-nums ${cellBg}`}
                            title={`${period.retainedCount} retained (${rate.toFixed(1)}%)`}
                          >
                            {rate.toFixed(1)}%
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </PpTable>
        )}
      </PpCard>

      {/* 5. Section 2: Payback Windows Overview */}
      {hasPaybackData && paybackOutcome?.ok && (
        <PpCard
          title="Cumulative Payback Collection"
          subtitle="Collected revenue across standard customer maturity windows"
          icon={TrendingUp}
          iconAccent="mint"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {paybackOutcome.windows.map((window) => (
              <div
                key={window.windowDays}
                className="rounded-2xl bg-pp-subtle-inset p-4 space-y-1 text-start"
              >
                <span className="text-pp-label-sm text-pp-outline block uppercase tracking-wider">
                  {window.windowDays} Days Collection
                </span>
                <span className="font-pp-display text-pp-headline-lg text-pp-on-surface font-bold tabular-nums block">
                  ${window.collectedRevenue.toLocaleString(locale)}
                </span>
              </div>
            ))}
          </div>
        </PpCard>
      )}
    </PpPage>
  );
}
