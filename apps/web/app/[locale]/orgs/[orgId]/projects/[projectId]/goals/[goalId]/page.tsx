import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can, computeElapsedFraction, formatMetricValue, todayUtcDateOnly } from '@growthos/shared';
import type { BoardTileQueryOutcome } from '@growthos/firebase-orm-models';
import { BarChart3, CalendarClock, Crosshair, Gauge, LineChart, Settings2, Target, TrendingUp } from 'lucide-react';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { getGoal, listMetricsCatalogForProject, listOrgPeople, listOrgProjects, queryBoardTiles, queryGoalProgress, resolveMetricDisplayUnits } from '@/lib/orgs/queries';
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
import { buildGoalThermometerView } from '@/lib/orgs/goal-view';
import { buildTileRenderView } from '@/lib/orgs/board-view';
import { calculateDaysRemaining } from '@/lib/orgs/funnel-goals-synthesizer';
import { goalComparisonRows, goalTrendRows, goalTrendTile, goalTrendWindow, vizFormatForMetricUnit } from '@/lib/orgs/growth-viz';
import { GoalThermometer } from '@/components/orgs/goal-thermometer';
import { DeleteGoalButton } from '@/components/orgs/delete-goal-button';
import { GoalStatusButton } from '@/components/orgs/goal-status-button';
import { EditGoalForm } from '@/components/orgs/edit-goal-form';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard, EmptyState, PageHero, TrendChart } from '@/components/viz';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string; goalId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Goals' });
  // Deliberately static, not the real goal name — same reasoning
  // `boards/[boardId]/page.tsx`'s own `generateMetadata` comment gives (it
  // runs independently of this page's own session/permission check below).
  return { title: t('metaTitle') };
}

/**
 * One goal (KAN-64, E12.1): its own settings (metric/direction/target-or-
 * range/deadline/owner) plus its computed pace thermometer — fetched
 * server-side via `queryGoalProgress`, the same "server-side query, then
 * render" structure `boards/[boardId]/page.tsx` uses per tile — a target vs
 * actual comparison of those same figures, and the goal metric's own
 * day-by-day trend over the goal's window (the same query a board line tile
 * runs). Gated on `dashboards.write`, same posture as the goals list page —
 * including the project-scope check (KAN-136).
 */
export default async function GoalDetailPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId, goalId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fgoals%2F${goalId}`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId, projectId })) {
    notFound();
  }

  const [projects, goal, people, metricCatalog, metricUnits] = await Promise.all([
    listOrgProjects(orgId),
    getGoal(orgId, projectId, goalId),
    listOrgPeople(orgId),
    listMetricsCatalogForProject(orgId, projectId),
    resolveMetricDisplayUnits(orgId, projectId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project || !goal) {
    notFound();
  }

  // KAN-196: every read below is scoped to the environment picked in the project shell (prod by default).
  const { selected: selectedEnvironment } = await resolveSelectedEnvironment(orgId, projectId);
  const environmentScope = { environmentId: selectedEnvironment?.id };
  const today = todayUtcDateOnly();
  const trendWindow = goalTrendWindow(goal, today);
  const trendTile = goalTrendTile(goal.metric_name);
  const [outcome, trendOutcome] = await Promise.all([
    queryGoalProgress(orgId, projectId, goal, environmentScope),
    // The metric's own daily trend. A failure here only empties the trend card - the goal's
    // progress above it is a separate read and still renders.
    trendWindow
      ? queryBoardTiles(
          orgId,
          projectId,
          { date_range: { kind: 'absolute', start: trendWindow.start, end: trendWindow.end, grain: 'day' }, compare: null, global_filters: [], tiles: [trendTile] },
          { ...environmentScope, today },
        )
          .then((outcomes): BoardTileQueryOutcome | null => outcomes[0] ?? null)
          .catch((): BoardTileQueryOutcome | null => null)
      : Promise.resolve<BoardTileQueryOutcome | null>(null),
  ]);
  // The goal metric's unit (KAN-213): the target and every progress figure are shown in it.
  const metricUnit = metricUnits[goal.metric_name];
  const thermometerView = buildGoalThermometerView(outcome, metricUnit);
  const formatTarget = (value: number | null): string => (value === null ? '' : formatMetricValue(value, metricUnit, locale));
  const peopleRows = people.map((person) => ({ id: person.id, name: person.name }));
  const ownerName = peopleRows.find((person) => person.id === goal.owner_person_id)?.name ?? goal.owner_person_id;
  const isPaused = (goal.status ?? 'active') === 'paused';

  const t = await getTranslations('Goals');
  const trendView = trendOutcome ? buildTileRenderView(trendTile, trendOutcome, null, metricUnits) : null;
  const dayFormat = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const formatDay = (day: string): string => {
    const date = new Date(`${day}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? day : dayFormat.format(date);
  };
  const trendRows =
    trendView?.kind === 'time_series' && !trendView.isEmpty && trendView.series[0] ? goalTrendRows(trendView.series[0].points, formatDay) : [];
  const trendHasValue = trendRows.some((row) => row.value !== null);
  const valueFormat = vizFormatForMetricUnit(metricUnit);
  const elapsedPercent = Math.round(computeElapsedFraction(goal.start_date, goal.deadline, today, goal.rhythm) * 100);
  const daysRemaining = calculateDaysRemaining(goal.deadline);
  const targetText =
    goal.direction === 'range' ? t('rangeText', { min: formatTarget(goal.range_min), max: formatTarget(goal.range_max) }) : formatTarget(goal.target_value);
  const measured = thermometerView.kind === 'ok' ? thermometerView : null;
  const comparison = measured
    ? goalComparisonRows(measured, goal, {
        actual: t('actualValueLabel'),
        expected: t('expectedAtNowLabel'),
        projected: t('projectedFinalValueLabel'),
        target: t('targetValueLabel'),
        rangeMin: t('rangeMinLabel'),
        rangeMax: t('rangeMaxLabel'),
      })
    : [];
  const trendUnavailable =
    trendOutcome && !trendOutcome.ok
      ? t(`thermometerUnavailableReason.${trendOutcome.reason}`)
      : !trendWindow
        ? t('trendNotStarted')
        : !trendHasValue
          ? t('thermometerUnavailableReason.no_measurements')
          : null;

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero
        icon={Target}
        eyebrow={t('detailEyebrow')}
        title={goal.name}
        description={t('detailDescription', { metricName: goal.metric_name, startDate: goal.start_date, deadline: goal.deadline })}
        actions={
          <>
            {isPaused ? (
              <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning ring-1 ring-warning/30">{t('pausedBadge')}</span>
            ) : null}
            <GoalStatusButton orgId={orgId} projectId={projectId} goalId={goalId} status={goal.status ?? 'active'} />
            <DeleteGoalButton orgId={orgId} projectId={projectId} goalId={goalId} />
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            title={t('actualValueLabel')}
            value={measured ? formatMetricValue(measured.actualValue, metricUnit, locale) : t('kpiNoValue')}
            icon={TrendingUp}
            progress={measured ? Math.round(measured.percentFilled) : undefined}
            targetHint={measured ? t('progressLabel') : undefined}
          />
          <StatCard title={goal.direction === 'range' ? t('rangeLabel') : t('targetValueLabel')} value={targetText} icon={Crosshair} subtext={t(`directionOption.${goal.direction}`)} />
          <StatCard title={t('expectedAtNowLabel')} value={measured ? formatMetricValue(measured.expectedAtNow, metricUnit, locale) : t('kpiNoValue')} icon={Gauge} />
          <StatCard
            title={t('timeElapsedLabel')}
            value={t('percentValue', { percent: elapsedPercent })}
            icon={CalendarClock}
            progress={elapsedPercent}
            targetHint={daysRemaining > 0 ? t('daysLeft', { count: daysRemaining }) : t('timeElapsedFinished')}
          />
        </div>
      </PageHero>

      <div className="grid gap-6 lg:grid-cols-5">
        <ChartCard title={t('thermometerHeading')} description={t('thermometerDescription')} icon={Gauge} className="lg:col-span-2" fill>
          <div className="flex flex-col gap-3">
            {isPaused ? <p className="rounded-xl bg-warning/10 px-3 py-2 text-xs text-warning">{t('pausedNoPace')}</p> : null}
            <GoalThermometer view={thermometerView} />
          </div>
        </ChartCard>
        <ChartCard title={t('comparisonTitle')} description={t('comparisonDescription')} icon={BarChart3} className="lg:col-span-3" fill>
          {comparison.length > 0 ? (
            <TrendChart label={t('comparisonTitle')} xKey="label" data={comparison} series={[{ key: 'value', label: goal.metric_name }]} kind="bar" valueFormat={valueFormat} height={220} />
          ) : (
            <EmptyState compact icon={BarChart3} title={t(`thermometerUnavailableReason.${thermometerView.kind === 'ok' ? 'no_measurements' : thermometerView.kind}`)} />
          )}
        </ChartCard>
      </div>

      <ChartCard title={t('trendTitle', { metricName: goal.metric_name })} description={t('trendDescription')} icon={LineChart}>
        {trendUnavailable ? (
          <EmptyState compact icon={LineChart} title={trendUnavailable} />
        ) : (
          <TrendChart label={t('trendTitle', { metricName: goal.metric_name })} xKey="day" data={trendRows} series={[{ key: 'value', label: goal.metric_name }]} kind="area" valueFormat={valueFormat} />
        )}
      </ChartCard>

      <ChartCard title={t('settingsHeading')} icon={Settings2}>
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
            <div className="flex flex-col gap-0.5 rounded-xl bg-muted/40 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{t('metricLabel')}</dt>
              <dd className="truncate font-medium" dir="ltr">{goal.metric_name}</dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-xl bg-muted/40 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{t('directionLabel')}</dt>
              <dd className="font-medium">{t(`directionOption.${goal.direction}`)}</dd>
            </div>
            {goal.direction === 'range' ? (
              <>
                <div className="flex flex-col gap-0.5 rounded-xl bg-muted/40 px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{t('rangeMinLabel')}</dt>
                  <dd className="font-medium">{formatTarget(goal.range_min)}</dd>
                </div>
                <div className="flex flex-col gap-0.5 rounded-xl bg-muted/40 px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{t('rangeMaxLabel')}</dt>
                  <dd className="font-medium">{formatTarget(goal.range_max)}</dd>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-0.5 rounded-xl bg-muted/40 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{t('targetValueLabel')}</dt>
                <dd className="font-medium">{formatTarget(goal.target_value)}</dd>
              </div>
            )}
            <div className="flex flex-col gap-0.5 rounded-xl bg-muted/40 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{t('startDateLabel')}</dt>
              <dd className="font-medium" dir="ltr">{goal.start_date}</dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-xl bg-muted/40 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{t('deadlineLabel')}</dt>
              <dd className="font-medium" dir="ltr">{goal.deadline}</dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-xl bg-muted/40 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{t('rhythmLabel')}</dt>
              <dd className="font-medium">{t(`rhythmOption.${goal.rhythm}`)}</dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-xl bg-muted/40 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{t('ownerLabel')}</dt>
              <dd className="font-medium">{ownerName}</dd>
            </div>
          </dl>
          {metricCatalog.length > 0 && peopleRows.length > 0 ? (
            <EditGoalForm
              orgId={orgId}
              projectId={projectId}
              goalId={goalId}
              metricCatalog={metricCatalog}
              people={peopleRows}
              initialName={goal.name}
              initialMetricName={goal.metric_name}
              initialDirection={goal.direction}
              initialTargetValue={goal.target_value}
              initialRangeMin={goal.range_min}
              initialRangeMax={goal.range_max}
              initialStartDate={goal.start_date}
              initialDeadline={goal.deadline}
              initialRhythm={goal.rhythm}
              initialOwnerPersonId={goal.owner_person_id}
            />
          ) : null}
        </div>
      </ChartCard>
    </main>
  );
}
