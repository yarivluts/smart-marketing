import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects, queryCohortRetention } from '@/lib/orgs/queries';
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
import { buildCohortRetentionView } from '@/lib/orgs/cohort-retention-view';
import { CalendarRange, DatabaseZap, Filter, Grid3X3, TrendingUp, Trophy, Users } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard, EmptyState, Heatmap, PageHero, TrendChart } from '@/components/viz';

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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId, projectId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  // KAN-196: every read below is scoped to the environment picked in the project shell (prod by default).
  const { selected: selectedEnvironment } = await resolveSelectedEnvironment(orgId, projectId);
  const environmentScope = { environmentId: selectedEnvironment?.id };
  const trimmedConversionEvent = conversionEventParam?.trim();
  const view = buildCohortRetentionView(
    await queryCohortRetention(orgId, projectId, trimmedConversionEvent ? { conversionEvent: trimmedConversionEvent, ...environmentScope } : environmentScope),
  );
  const t = await getTranslations('CohortRetention');
  const monthLabel = (cohortMonth: string): string => {
    const date = new Date(cohortMonth);
    return Number.isNaN(date.getTime()) ? cohortMonth : new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
  };
  const numberFormat = new Intl.NumberFormat(locale);

  const ok = view.kind === 'ok' && view.cohorts.length > 0 ? view : null;
  // Period-1 retention per cohort: the first read on whether a signup month stuck at all.
  const firstPeriodRates = ok
    ? ok.cohorts
        .map((cohort) => ({ cohort, rate: cohort.periods.find((period) => period.periodNumber === 1)?.retentionRatePercent }))
        .filter((entry): entry is { cohort: (typeof ok.cohorts)[number]; rate: number } => entry.rate !== undefined)
    : [];
  const averageFirstPeriod = firstPeriodRates.length > 0 ? Math.round(firstPeriodRates.reduce((sum, entry) => sum + entry.rate, 0) / firstPeriodRates.length) : null;
  const bestCohort = firstPeriodRates.length > 0 ? firstPeriodRates.reduce((best, entry) => (entry.rate > best.rate ? entry : best)) : null;
  const totalPeople = ok ? ok.cohorts.reduce((sum, cohort) => sum + cohort.cohortSize, 0) : 0;
  // The average curve weights every cohort equally at each period it has reached.
  const curve = ok
    ? ok.periodNumbers.map((periodNumber) => {
        const rates = ok.cohorts.flatMap((cohort) => cohort.periods.filter((period) => period.periodNumber === periodNumber).map((period) => period.retentionRatePercent));
        return { period: t('periodShort', { periodNumber }), retention: rates.length > 0 ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : null };
      })
    : [];

  const unavailable =
    view.kind === 'warehouse_not_configured' ? t('notConfigured') : view.kind === 'quota_exceeded' ? t('quotaExceeded') : view.kind === 'query_error' ? t('queryError') : null;

  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={Grid3X3} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('description')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiCohorts')} value={ok ? numberFormat.format(ok.cohorts.length) : t('kpiNoValue')} icon={CalendarRange} />
          <StatCard title={t('kpiPeople')} value={ok ? numberFormat.format(totalPeople) : t('kpiNoValue')} icon={Users} />
          <StatCard
            title={t('kpiFirstPeriod')}
            value={averageFirstPeriod !== null ? t('retentionCell', { percent: averageFirstPeriod }) : t('kpiNoValue')}
            icon={TrendingUp}
            progress={averageFirstPeriod ?? undefined}
          />
          <StatCard
            title={t('kpiBestCohort')}
            value={bestCohort ? monthLabel(bestCohort.cohort.cohortMonth) : t('kpiNoValue')}
            subtext={bestCohort ? t('retentionCell', { percent: bestCohort.rate }) : undefined}
            icon={Trophy}
          />
        </div>
      </PageHero>

      <ChartCard title={t('filterTitle')} description={t('filterHint')} icon={Filter}>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-64 flex-1 flex-col gap-1">
            <label htmlFor="cohort-conversion-event" className="text-xs font-medium text-muted-foreground">
              {t('conversionEventLabel')}
            </label>
            <input
              id="cohort-conversion-event"
              name="conversionEvent"
              defaultValue={conversionEventParam ?? ''}
              placeholder={t('conversionEventPlaceholder')}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button type="submit" className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
            {t('conversionEventApplyButton')}
          </button>
          {trimmedConversionEvent ? (
            <Link href={{ pathname: `/orgs/${orgId}/projects/${projectId}/cohorts` }} className="h-10 rounded-xl px-3 text-sm leading-10 text-muted-foreground underline-offset-4 hover:underline">
              {t('conversionEventClear')}
            </Link>
          ) : null}
        </form>
      </ChartCard>

      {unavailable ? (
        <EmptyState icon={DatabaseZap} title={unavailable} />
      ) : !ok ? (
        <EmptyState icon={Grid3X3} title={t('empty')} description={t('emptyDetail')} />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-5">
            <ChartCard title={t('curveTitle')} description={t('curveDescription')} icon={TrendingUp} className="lg:col-span-3" fill>
              <TrendChart label={t('curveTitle')} xKey="period" data={curve} series={[{ key: 'retention', label: t('curveSeries') }]} kind="line" valueFormat="percent" />
            </ChartCard>
            <ChartCard title={t('sizesTitle')} description={t('sizesDescription')} icon={Users} className="lg:col-span-2" fill>
              <TrendChart
                label={t('sizesTitle')}
                xKey="month"
                data={ok.cohorts.map((cohort) => ({ month: monthLabel(cohort.cohortMonth), people: cohort.cohortSize }))}
                series={[{ key: 'people', label: t('sizesSeries'), color: 'hsl(var(--info))' }]}
                kind="bar"
              />
            </ChartCard>
          </div>

          <ChartCard title={t('matrixTitle')} description={t('matrixDescription')} icon={Grid3X3}>
            <Heatmap
              label={t('matrixTitle')}
              rowHeader={t('cohortColumnHeading')}
              columns={ok.periodNumbers.map((periodNumber) => t('periodColumnHeading', { periodNumber }))}
              max={100}
              valueFormatter={(value) => t('retentionCell', { percent: value })}
              rows={ok.cohorts.map((cohort) => {
                const percentByPeriod = new Map(cohort.periods.map((period) => [period.periodNumber, period.retentionRatePercent]));
                return {
                  key: cohort.cohortMonth,
                  label: monthLabel(cohort.cohortMonth),
                  sublabel: t('cohortSizeSublabel', { count: cohort.cohortSize }),
                  cells: ok.periodNumbers.map((periodNumber) => percentByPeriod.get(periodNumber) ?? null),
                };
              })}
            />
          </ChartCard>
        </>
      )}
    </div>
  );
}
