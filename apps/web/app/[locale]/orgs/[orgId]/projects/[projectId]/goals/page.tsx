import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can, formatMetricValue } from '@growthos/shared';
import type { GoalProgressOutcome } from '@growthos/firebase-orm-models';
import { AlertTriangle, CalendarClock, CheckCircle2, Gauge, ListChecks, PieChart, Plus, Target, User } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listGoalsForProject, listMetricsCatalogForProject, listOrgPeople, listOrgProjects, queryGoalProgress, resolveMetricDisplayUnits } from '@/lib/orgs/queries';
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
import { buildUnifiedGoalsData, type UnifiedGoalItem } from '@/lib/orgs/funnel-goals-synthesizer';
import { summarizeGoalStatusMix, type GoalStatusMix } from '@/lib/orgs/growth-viz';
import { buildGoalsKpiValues } from '@/lib/orgs/goals-kpis';
import { cn } from '@/lib/utils';
import { CreateGoalForm } from '@/components/orgs/create-goal-form';
import { GoalTargetInput } from '@/components/orgs/goal-target-input';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard, DonutChart, EmptyState, PageHero, TrendChart } from '@/components/viz';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Goals' });
  return { title: t('metaTitle') };
}

const STATUS_TONE: Record<NonNullable<UnifiedGoalItem['status']>, { bar: string; badge: string }> = {
  on_track: { bar: 'bg-success', badge: 'bg-success/10 text-success ring-success/30' },
  at_risk: { bar: 'bg-warning', badge: 'bg-warning/10 text-warning ring-warning/30' },
  off_track: { bar: 'bg-destructive', badge: 'bg-destructive/10 text-destructive ring-destructive/30' },
};

const MIX_COLORS: Record<keyof GoalStatusMix, string> = {
  on_track: 'hsl(var(--success))',
  at_risk: 'hsl(var(--warning))',
  off_track: 'hsl(var(--destructive))',
  paused: 'hsl(var(--muted-foreground) / 0.5)',
  unmeasured: 'hsl(var(--info))',
};

const MIX_ORDER: (keyof GoalStatusMix)[] = ['on_track', 'at_risk', 'off_track', 'paused', 'unmeasured'];

/**
 * A project's goals (KAN-64, E12.1, plan `04 §6`): every goal created in this project, each as a
 * pace card (measured progress against its target, with a marker for how much of its window has
 * elapsed) carrying the inline-editable target (KAN-85, plan `14 §Gap 15`), plus a form to create a
 * new one. Progress comes from the same `queryGoalProgress` read the goal detail page and the Funnel
 * & Goals hub use; a goal whose progress could not be measured says why instead of showing a 0.
 * Gated on `dashboards.write` for the whole page — the same "whole feature, not just mutation, is
 * admin-only" posture every other project admin surface in this codebase (including
 * `boards/page.tsx`, which this page mirrors) uses. Checked at project scope, not just org scope
 * (KAN-136), so a project-scoped `project_admin`/`editor`/`operator` (KAN-135) can reach their own
 * project's goals, not only an org-scope admin.
 */
export default async function GoalsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fgoals`);
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

  // Only reached once `projectId` is confirmed to belong to this org — same
  // reasoning `boards/page.tsx`'s own comment gives for `listBoardsForProject`.
  const [goals, metricCatalog, people, metricUnits, { selected: selectedEnvironment }] = await Promise.all([
    listGoalsForProject(orgId, projectId),
    listMetricsCatalogForProject(orgId, projectId),
    listOrgPeople(orgId),
    resolveMetricDisplayUnits(orgId, projectId).catch(() => ({})),
    resolveSelectedEnvironment(orgId, projectId),
  ]);
  // KAN-196: progress is measured in the environment picked in the project shell (prod by default).
  const environmentScope = { environmentId: selectedEnvironment?.id };
  const outcomes = new Map<string, GoalProgressOutcome>();
  await Promise.all(
    goals.map(async (goal) => {
      try {
        outcomes.set(goal.id, await queryGoalProgress(orgId, projectId, goal, environmentScope));
      } catch {
        // Left out of the map: `buildUnifiedGoalsData` reports this goal as `query_error`.
      }
    }),
  );
  // Every registered person's name still resolves for an existing goal's own owner label — an
  // archived person (KAN-129) isn't erased, only hidden from picking a *new* owner below.
  const personNameById = new Map(people.map((person) => [person.id, person.name]));
  const { items, summary } = buildUnifiedGoalsData(
    [...goals].sort((a, b) => a.deadline.localeCompare(b.deadline)),
    outcomes,
    personNameById,
    metricUnits,
  );
  const unitByMetric = new Map(metricCatalog.map((entry) => [entry.name, entry.unit]));
  const peopleRows = people.filter((person) => !person.archived_at).map((person) => ({ id: person.id, name: person.name }));
  const t = await getTranslations('Goals');
  const tMix = await getTranslations('FunnelGoals');
  const numberFormat = new Intl.NumberFormat(locale);
  const mix = summarizeGoalStatusMix(items);
  const kpis = buildGoalsKpiValues(summary, {
    formatNumber: (value) => numberFormat.format(value),
    ofMeasured: (count, total) => t('kpiOfMeasured', { count, total }),
    percent: (percent) => t('percentValue', { percent }),
    emptyValue: t('kpiEmptyValue'),
    avgProgressNone: t('kpiAvgProgressNone'),
  });
  const measured = items.filter((item) => item.progressKind === 'ok' && item.percentFilled !== null && !item.isPaused);
  const show = (goal: UnifiedGoalItem, value: number): string => formatMetricValue(value, goal.unit, locale);
  const targetText = (goal: UnifiedGoalItem): string =>
    goal.direction === 'range'
      ? t('rangeText', { min: show(goal, goal.rangeMin ?? 0), max: show(goal, goal.rangeMax ?? 0) })
      : show(goal, goal.targetValue ?? 0);

  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={Target} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('pageDescription')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiGoals')} value={numberFormat.format(items.length)} icon={ListChecks} subtext={summary.pausedGoalsCount > 0 ? t('kpiPausedSubtext', { count: summary.pausedGoalsCount }) : undefined} />
          <StatCard title={t('kpiOnTrack')} value={kpis.onTrack} icon={CheckCircle2} />
          <StatCard title={t('kpiNeedsAttention')} value={kpis.needsAttention} icon={AlertTriangle} />
          <StatCard title={t('kpiAvgProgress')} value={kpis.avgProgress} subtext={kpis.avgProgressSubtext} icon={Gauge} progress={kpis.avgProgressBar} />
        </div>
      </PageHero>

      {items.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-5">
          <ChartCard title={t('paceChartTitle')} description={t('paceChartDescription')} icon={Gauge} className="lg:col-span-3" fill>
            {measured.length > 0 ? (
              <TrendChart
                label={t('paceChartTitle')}
                xKey="goal"
                data={measured.map((goal) => ({ goal: goal.name, progress: goal.percentFilled, elapsed: Math.round(goal.elapsedFraction * 100) }))}
                series={[
                  { key: 'progress', label: t('paceSeriesProgress') },
                  { key: 'elapsed', label: t('paceSeriesElapsed'), color: 'hsl(var(--muted-foreground) / 0.45)' },
                ]}
                kind="bar"
                valueFormat="percent"
              />
            ) : (
              <EmptyState compact icon={Gauge} title={t('paceChartEmpty')} description={t('paceChartEmptyDetail')} />
            )}
          </ChartCard>
          <ChartCard title={tMix('goalsMixTitle')} description={tMix('goalsMixDescription')} icon={PieChart} className="lg:col-span-2" fill>
            <DonutChart
              label={tMix('goalsMixTitle')}
              size={150}
              layout="stacked"
              centerValue={numberFormat.format(items.length)}
              centerLabel={tMix('goalsMixCenter')}
              data={MIX_ORDER.filter((key) => mix[key] > 0).map((key) => ({ label: tMix(`goalsMix.${key}`), value: mix[key], color: MIX_COLORS[key] }))}
            />
          </ChartCard>
        </div>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="goals-heading">
        <h2 id="goals-heading" className="text-lg font-semibold">
          {t('goalsHeading')}
        </h2>
        {items.length === 0 ? (
          <EmptyState icon={Target} title={t('noGoals')} description={t('noGoalsDetail')} />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2" data-testid="goal-pace-cards">
            {items.map((goal) => {
              const measuredGoal = goal.progressKind === 'ok' && goal.percentFilled !== null && goal.status !== null && !goal.isPaused;
              const tone = goal.status ? STATUS_TONE[goal.status] : null;
              const elapsedPercent = Math.round(goal.elapsedFraction * 100);
              return (
                <li key={goal.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md" data-testid={`goal-pace-card-${goal.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="inline-flex max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground" dir="ltr">
                        {goal.metricName}
                      </span>
                      <Link className="mt-1 block truncate text-base font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline" href={`/orgs/${orgId}/projects/${projectId}/goals/${goal.id}`}>
                        {goal.name}
                      </Link>
                    </div>
                    {goal.isPaused ? (
                      <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border">{t('pausedBadge')}</span>
                    ) : measuredGoal && tone && goal.status ? (
                      <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1', tone.badge)}>{t(`paceStatus.${goal.status}`)}</span>
                    ) : null}
                  </div>

                  {measuredGoal ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-semibold text-foreground" dir="ltr">
                          {show(goal, goal.actualValue ?? 0)}
                        </span>
                        <span className="text-xs text-muted-foreground">{t('ofTarget', { target: targetText(goal) })}</span>
                      </div>
                      <div
                        className="relative h-2.5 w-full rounded-full bg-muted"
                        role="progressbar"
                        aria-label={t('progressLabel')}
                        aria-valuenow={goal.percentFilled ?? 0}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div className={cn('h-full rounded-full', tone?.bar)} style={{ width: `${Math.max(2, goal.percentFilled ?? 0)}%` }} />
                        <span className="absolute -top-1 h-4 w-0.5 rounded-full bg-foreground/60" style={{ insetInlineStart: `${elapsedPercent}%` }} title={t('elapsedMarker', { percent: elapsedPercent })} aria-hidden="true" />
                      </div>
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>{t('percentFilledLine', { percent: goal.percentFilled ?? 0 })}</span>
                        <span>{t('elapsedMarker', { percent: elapsedPercent })}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      {goal.isPaused ? t('pausedNoPace') : t(`thermometerUnavailableReason.${goal.progressKind === 'ok' ? 'no_measurements' : goal.progressKind}`)}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span>{t('columnTarget')}</span>
                      <GoalTargetInput
                        orgId={orgId}
                        projectId={projectId}
                        goalId={goal.id}
                        goalName={goal.name}
                        direction={goal.direction}
                        targetValue={goal.targetValue}
                        rangeMin={goal.rangeMin}
                        rangeMax={goal.rangeMax}
                        unit={unitByMetric.get(goal.metricName)}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1" title={t('columnDeadline')}>
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                        <span dir="ltr">{goal.deadline}</span>
                        {goal.daysRemaining > 0 ? <span>{t('daysLeft', { count: goal.daysRemaining })}</span> : null}
                      </span>
                      <span className="inline-flex items-center gap-1" title={t('columnOwner')}>
                        <User className="h-3.5 w-3.5" aria-hidden="true" />
                        {goal.ownerName ?? goal.ownerPersonId}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ChartCard title={t('createHeading')} description={t('createDescription')} icon={Plus}>
        <div className="flex flex-col gap-3">
          {metricCatalog.length === 0 ? <p className="text-xs text-muted-foreground">{t('noMetricsRegistered')}</p> : null}
          {peopleRows.length === 0 ? <p className="text-xs text-muted-foreground">{t('noPeople')}</p> : null}
          {metricCatalog.length > 0 && peopleRows.length > 0 ? (
            <CreateGoalForm orgId={orgId} projectId={projectId} metricCatalog={metricCatalog} people={peopleRows} />
          ) : null}
        </div>
      </ChartCard>
    </div>
  );
}
