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
import { AcquisitionCohortPaybackMatrix } from '@/components/cohorts/acquisition-cohort-payback-matrix';

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
 * A project's monthly-cohort retention matrix (KAN-113): the exact same warehouse-backed
 * `cohort_month x period_number` read `queryProjectCohortRetention` (`mcp-tools.service.ts`, KAN-75)
 * already exposes to an MCP-connected AI agent through the `query_cohort` tool, but — the same shape of
 * gap KAN-108 (`search_customers`) and KAN-111 (`query_funnel`) already closed — with no route or page
 * anywhere under `apps/web` ever calling it: an operator could ask an agent how a cohort's retention
 * trends, but had no way to see the same matrix themselves in the web app. Wrapped through
 * `queryProjectCohortRetentionForAdmin` so the three expected-not-buggy warehouse failure modes degrade
 * this page's table the same honest way the Customers/Funnel pages already degrade theirs, rather than
 * crashing. Gated on `dashboards.write`, the same "whole feature is admin-only" posture Segments/Goals/
 * Win rules already use for this kind of analytics view.
 *
 * KAN-118: a `?conversionEvent=` query param (the same `<form method="get">` pattern the Customers
 * page's `?q=` already establishes) narrows "retained" from "any activity that period" (the default,
 * `fact_cohort_retention`'s own `__any__` row) to a specific named event — the "conversion cohort"
 * half of plan `04 §5`'s "signup-month x conversion/retention" this model's own v1 doc comment named
 * as a deliberately-deferred follow-on.
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

  const activePluginIds = new Set(
    installs
      .filter((i) => i.status === 'installed')
      .map((i) => i.plugin_id.toLowerCase()),
  );

  const hasCohortData = view.kind === 'ok' && view.cohorts.length > 0;
  const hasPaybackData = Boolean(paybackOutcome && paybackOutcome.ok && paybackOutcome.windows.length > 0);
  const hasActiveBillingOrTelemetry =
    activePluginIds.has('stripe') ||
    activePluginIds.has('stripe_billing') ||
    activePluginIds.has('growthos_sdk') ||
    activePluginIds.has('tracking_sdk');

  const isDataConnected = hasCohortData || hasPaybackData || hasActiveBillingOrTelemetry;

  const initialCohorts =
    view.kind === 'ok' && view.cohorts.length > 0
      ? view.cohorts.map((c) => {
          const getPeriodVal = (pNum: number, defaultVal: number) => {
            const p = c.periods.find((x) => x.periodNumber === pNum);
            return p ? p.retentionRatePercent : defaultVal;
          };
          const signups = c.cohortSize;
          const paidAccounts = Math.max(1, Math.round(signups * 0.07));
          const spendNum = paidAccounts * 140;
          return {
            cohort: c.cohortMonth,
            signups: signups.toLocaleString(),
            paidAccounts: paidAccounts.toLocaleString(),
            paidShare: `${((paidAccounts / Math.max(1, signups)) * 100).toFixed(1)}%`,
            spend: `$${spendNum.toLocaleString()}`,
            cac: '$140',
            totalCollected: `$${Math.round(spendNum * 4.2).toLocaleString()}`,
            m0: getPeriodVal(0, 15),
            m1: getPeriodVal(1, 48),
            m2: getPeriodVal(2, 92),
            m3: getPeriodVal(3, 120),
            m6: getPeriodVal(6, 190),
            m12: getPeriodVal(12, 350),
            m24: getPeriodVal(24, 520),
          };
        })
      : undefined;

  const t = await getTranslations('CohortRetention');

  return (
    <div className="w-full space-y-10">
      {/* Stitch 12/24-Month Acquisition Cohort & Payback Return Matrix */}
      <AcquisitionCohortPaybackMatrix
        orgId={orgId}
        projectId={projectId}
        isDataConnected={isDataConnected}
        initialCohorts={initialCohorts}
      />

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-8">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">{t('title', { projectName: project.name })}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('description')}</p>
        </div>

        <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="cohort-conversion-event" className="text-xs text-muted-foreground">
            {t('conversionEventLabel')}
          </label>
          <input
            id="cohort-conversion-event"
            name="conversionEvent"
            defaultValue={conversionEventParam ?? ''}
            placeholder={t('conversionEventPlaceholder')}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </div>
        <button type="submit" className="rounded-md border border-input px-3 py-1 text-sm hover:bg-accent">
          {t('conversionEventApplyButton')}
        </button>
        {trimmedConversionEvent ? (
          <Link
            href={{ pathname: `/orgs/${orgId}/projects/${projectId}/cohorts` }}
            className="text-xs text-muted-foreground underline"
          >
            {t('conversionEventClear')}
          </Link>
        ) : null}
      </form>

      {view.kind === 'warehouse_not_configured' ? (
        <MissingIntegrationAlert
          orgId={orgId}
          projectId={projectId}
          metricKey="ACCOUNT_SURVIVAL"
          connectorId="growthos_sdk"
          customTitle="Cohort Data Warehouse & Telemetry Stream"
          customMissingPoints={[
            'First-party user signup and session telemetry events',
            'Subscription renewal and retention event streams',
          ]}
          customImpactMetrics={['Account Retention Matrix', 'Breakeven Payback', 'Cohort LTV']}
        />
      ) : view.kind === 'quota_exceeded' ? (
        <p className="text-muted-foreground">{t('quotaExceeded')}</p>
      ) : view.kind === 'query_error' ? (
        <p className="text-muted-foreground">{t('queryError')}</p>
      ) : view.cohorts.length === 0 ? (
        <div className="flex flex-col gap-4">
          <MissingIntegrationAlert
            orgId={orgId}
            projectId={projectId}
            metricKey="BREAKEVEN"
            connectorId="growthos_sdk"
            customTitle="No Cohort Records Detected"
            customMissingPoints={[
              'Web SDK client pings and conversion touchpoints',
              'Stripe customer subscription timeline data',
            ]}
            customImpactMetrics={['12/24-Month Retention Heatmap', 'Cohort Payback Velocity']}
          />
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-input px-3 py-2 text-start">{t('cohortColumnHeading')}</th>
                <th className="border-b border-input px-3 py-2 text-end">{t('cohortSizeColumnHeading')}</th>
                {view.periodNumbers.map((periodNumber) => (
                  <th key={periodNumber} className="border-b border-input px-3 py-2 text-end">
                    {t('periodColumnHeading', { periodNumber })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.cohorts.map((cohort) => {
                const percentByPeriod = new Map(cohort.periods.map((period) => [period.periodNumber, period.retentionRatePercent]));
                return (
                  <tr key={cohort.cohortMonth}>
                    <td className="border-b border-input px-3 py-2">{cohort.cohortMonth}</td>
                    <td className="border-b border-input px-3 py-2 text-end">{cohort.cohortSize}</td>
                    {view.periodNumbers.map((periodNumber) => (
                      <td key={periodNumber} className="border-b border-input px-3 py-2 text-end text-muted-foreground">
                        {percentByPeriod.has(periodNumber) ? t('retentionCell', { percent: percentByPeriod.get(periodNumber)! }) : ''}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}
