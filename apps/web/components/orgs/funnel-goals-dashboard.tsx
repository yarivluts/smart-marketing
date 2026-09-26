'use client';

import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  TrendingUp,
  Target,
  Users,
  Activity,
  Layers,
  Sparkles,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Plus,
  Search,
  Workflow,
  BarChart3,
  TrendingDown,
  PieChart,
  Gauge,
  Wallet,
  Award,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarList, ChartCard, DonutChart, EmptyState, FlowDiagram, PageHero, TrendChart } from '@/components/viz';
import { VisualFunnelSteps } from './visual-funnel-steps';
import { CohortRetentionMatrix } from './cohort-retention-matrix';
import { GoalThermometerCard } from './goal-thermometer-card';
import { CreateGoalModal } from './create-goal-modal';
import type {
  FunnelGoalsCockpitData,
  UnifiedGoalItem,
  WarehouseSectionKind,
} from '@/lib/orgs/funnel-goals-synthesizer';
import { MIN_FUNNEL_ENTRANTS_FOR_ALERT } from '@/lib/orgs/funnel-goals-synthesizer';
import {
  averageRetentionCurve,
  buildFunnelConversionRows,
  buildFunnelFlow,
  buildFunnelLosses,
  funnelStepLabel,
  summarizeGoalStatusMix,
  type GoalStatusMix,
} from '@/lib/orgs/growth-viz';

export interface FunnelGoalsDashboardProps {
  orgId: string;
  projectId: string;
  projectName: string;
  cockpitData: FunnelGoalsCockpitData;
  canExecute: boolean;
  metricCatalog?: { name: string; unit?: string }[];
  people?: { id: string; name: string }[];
}

type IconType = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;

/** Shared empty state: what is missing, and (optionally) how to get it. The wrapper keeps the section's own test id. */
function EmptySection({
  testId,
  title,
  body,
  action,
  icon,
}: {
  testId: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
  icon: IconType;
}): React.ReactElement {
  return (
    <div data-testid={testId}>
      <EmptyState icon={icon} title={title} description={body} action={action} />
    </div>
  );
}

/** One headline figure in the hero - the kit's stat-card look, with a test id on the value itself. */
function KpiTile({
  title,
  icon: Icon,
  value,
  valueTestId,
  valueClassName,
  footnote,
  progress,
}: {
  title: string;
  icon: IconType;
  value: string;
  valueTestId?: string;
  valueClassName?: string;
  footnote?: React.ReactNode;
  /** 0..100 - drawn as a thin bar under the value, only for a measured percentage. */
  progress?: number | null;
}): React.ReactElement {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-xs font-medium text-muted-foreground">{title}</span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div className={cn('mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl', valueClassName)} dir="ltr" data-testid={valueTestId}>
        {value}
      </div>
      {progress !== undefined && progress !== null ? (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-[hsl(var(--gradient-to))]" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      ) : null}
      {footnote}
    </div>
  );
}

const GOAL_MIX_COLORS: Record<keyof GoalStatusMix, string> = {
  on_track: 'hsl(var(--success))',
  at_risk: 'hsl(var(--warning))',
  off_track: 'hsl(var(--destructive))',
  paused: 'hsl(var(--muted-foreground) / 0.5)',
  unmeasured: 'hsl(var(--info))',
};

const GOAL_MIX_ORDER: (keyof GoalStatusMix)[] = ['on_track', 'at_risk', 'off_track', 'paused', 'unmeasured'];

export function FunnelGoalsDashboard({
  orgId,
  projectId,
  projectName,
  cockpitData,
  canExecute,
  metricCatalog = [],
  people = [],
}: FunnelGoalsDashboardProps): React.ReactElement {
  const t = useTranslations('FunnelGoals');
  const tFunnel = useTranslations('Funnel');
  const tCohort = useTranslations('CohortRetention');
  /*
    Every KPI below is nullable and renders "No data" when unmeasured. Nothing on this page is
    ever filled in when the project has not measured it: with no funnel, no goals, or no landed
    warehouse data, each section says what is missing instead of showing a sample (see
    funnel-goals-synthesizer.ts's data-honesty contract). The charts only draw measured rows.
  */
  const noData = t('noData');
  const pct = (value: number | null): string => (value === null ? noData : `${value}%`);
  const tGoals = useTranslations('Goals');

  const [activeTab, setActiveTab] = useState<'funnel' | 'goals' | 'retention'>('funnel');
  const [recommendationApplied, setRecommendationApplied] = useState(false);
  const [recommendationError, setRecommendationError] = useState(false);
  const [isApplyingRec, setIsApplyingRec] = useState(false);

  // Goals tab filters & state
  const [goals, setGoals] = useState<UnifiedGoalItem[]>(cockpitData.goals);
  const [goalStatusFilter, setGoalStatusFilter] = useState<'all' | 'on_track' | 'at_risk' | 'off_track'>('all');
  const [goalSearchQuery, setGoalSearchQuery] = useState('');
  const [isCreateGoalOpen, setIsCreateGoalOpen] = useState(false);

  const {
    summary,
    funnelSteps,
    funnelViewKind,
    cohortRows,
    cohortPeriodNumbers,
    cohortViewKind,
    paybackVelocity,
    paybackViewKind,
    qualityCalibration,
    calibrationViewKind,
    proactiveRecommendation,
  } = cockpitData;

  const projectBase = `/orgs/${orgId}/projects/${projectId}`;
  const funnelMeasured = funnelViewKind === 'ok' && funnelSteps.length > 0;

  const filteredGoals = useMemo(() => {
    return goals.filter((g) => {
      const matchesStatus = goalStatusFilter === 'all' || g.status === goalStatusFilter;
      const query = goalSearchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        g.name.toLowerCase().includes(query) ||
        g.metricName.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [goals, goalStatusFilter, goalSearchQuery]);

  const funnelFlow = useMemo(
    () =>
      buildFunnelFlow(funnelSteps, {
        people: (count) => tFunnel('peopleCount', { count }),
        conversion: (percent) => t('flowConversion', { percent }),
        dropOff: (percent) => t('flowDropOff', { percent }),
      }),
    [funnelSteps, t, tFunnel],
  );
  const conversionRows = useMemo(() => buildFunnelConversionRows(funnelSteps), [funnelSteps]);
  const funnelLosses = useMemo(() => buildFunnelLosses(funnelSteps), [funnelSteps]);
  const goalMix = useMemo(() => summarizeGoalStatusMix(goals), [goals]);
  const measuredGoals = useMemo(() => goals.filter((goal) => goal.progressKind === 'ok' && goal.percentFilled !== null && !goal.isPaused), [goals]);
  const retentionCurve = useMemo(() => averageRetentionCurve(cohortRows, cohortPeriodNumbers), [cohortRows, cohortPeriodNumbers]);

  async function handleApplyRecommendation(): Promise<void> {
    if (!proactiveRecommendation || !canExecute || isApplyingRec) return;
    setIsApplyingRec(true);
    setRecommendationError(false);
    try {
      const res = await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/actions/quick-execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetId: proactiveRecommendation.targetId,
          actionType: proactiveRecommendation.actionType,
        }),
      });
      // Only a request that went through is reported as applied. This used to set "Optimization
      // active!" on failure too, telling the user an action ran that never did.
      if (res.ok) {
        setRecommendationApplied(true);
      } else {
        setRecommendationError(true);
      }
    } catch {
      setRecommendationError(true);
    } finally {
      setIsApplyingRec(false);
    }
  }

  function handleTargetUpdated(
    goalId: string,
    patch: { targetValue?: number; rangeMin?: number; rangeMax?: number },
  ): void {
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;
        return {
          ...g,
          targetValue: patch.targetValue !== undefined ? patch.targetValue : g.targetValue,
          rangeMin: patch.rangeMin !== undefined ? patch.rangeMin : g.rangeMin,
          rangeMax: patch.rangeMax !== undefined ? patch.rangeMax : g.rangeMax,
        };
      }),
    );
  }

  function sectionUnavailableText(kind: WarehouseSectionKind, noDataText: string): string {
    return kind === 'no_data' || kind === 'ok' ? noDataText : t(`sectionUnavailable.${kind}`);
  }

  const tabs: { id: 'funnel' | 'goals' | 'retention'; testId: string; icon: IconType; label: string; count?: number }[] = [
    { id: 'funnel', testId: 'tab-funnel-btn', icon: Layers, label: t('tabFunnel') },
    { id: 'goals', testId: 'tab-goals-btn', icon: Target, label: t('tabGoals'), count: goals.length },
    { id: 'retention', testId: 'tab-retention-btn', icon: Activity, label: t('tabRetention') },
  ];

  return (
    <div className="flex flex-col gap-6 pb-16" data-testid="funnel-goals-dashboard">
      {/* 1. Hero + executive summary KPIs */}
      <PageHero icon={Target} eyebrow={t('eyebrow')} title={t('cockpitTitle')} description={t('cockpitDescription')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" data-testid="kpi-metric-cards">
          <KpiTile
            title={t('kpiOverallConversion')}
            icon={Target}
            value={pct(summary.overallFunnelConversionPct)}
            valueTestId="kpi-overall-conversion"
            progress={summary.overallFunnelConversionPct}
            footnote={
              /* B22: a rate on 4 people looks exactly like a rate on 40,000 unless it says otherwise. */
              summary.funnelEntrants !== null && summary.funnelEntrants > 0 && summary.funnelEntrants < MIN_FUNNEL_ENTRANTS_FOR_ALERT ? (
                <span className="mt-1.5 text-[11px] leading-snug text-warning" data-testid="kpi-overall-conversion-low-sample">
                  {t('kpiLowSample', { count: summary.funnelEntrants })}
                </span>
              ) : null
            }
          />
          <KpiTile
            title={t('kpiGoalsOnTrack')}
            icon={TrendingUp}
            value={summary.goalsMeasuredCount === 0 ? noData : `${summary.goalsOnTrackCount} / ${summary.goalsMeasuredCount}`}
            valueTestId="kpi-goals-on-track"
            valueClassName={summary.goalsMeasuredCount === 0 ? undefined : 'text-success'}
            progress={summary.goalsMeasuredCount === 0 ? null : (summary.goalsOnTrackCount / summary.goalsMeasuredCount) * 100}
            footnote={
              summary.goalsPausedCount > 0 ? (
                <span className="mt-1.5 text-[11px] text-muted-foreground" data-testid="kpi-goals-paused">
                  {t('kpiGoalsPaused', { count: summary.goalsPausedCount })}
                </span>
              ) : null
            }
          />
          <KpiTile title={t('kpiM1Retention')} icon={Users} value={pct(summary.avgMonth1RetentionPct)} progress={summary.avgMonth1RetentionPct} />
          <KpiTile
            title={t('kpiConversionVelocity')}
            icon={Clock}
            value={summary.avgConversionVelocityDays === null ? noData : `${summary.avgConversionVelocityDays} ${t('daysUnit')}`}
            footnote={<span className="mt-1.5 text-[11px] text-muted-foreground">{t('kpiTimeToSign')}</span>}
          />
          <KpiTile
            title={t('kpiPaybackRevenue')}
            icon={Wallet}
            value={summary.total40dPaybackUsd === null ? noData : `$${summary.total40dPaybackUsd.toLocaleString()}`}
          />
          <KpiTile
            title={t('kpiDunningRecovery')}
            icon={ShieldCheck}
            value={pct(summary.dunningRecoveryRatePct)}
            valueClassName={summary.dunningRecoveryRatePct === null ? undefined : 'text-success'}
            progress={summary.dunningRecoveryRatePct}
            footnote={
              summary.churnRatePct === null ? null : (
                <span className="mt-1.5 text-[11px] text-muted-foreground">{t('kpiChurnRate', { rate: summary.churnRatePct })}</span>
              )
            }
          />
        </div>
      </PageHero>

      {/* 2. In-Context Proactive Recommendation - only ever built from a measured funnel */}
      {proactiveRecommendation && (
        <div
          data-testid="proactive-recommendation-card"
          className="flex flex-col justify-between gap-4 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 via-accent/5 to-primary/10 p-4 shadow-sm sm:flex-row sm:items-center"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                {t('proactiveRecommendationHeading')}
              </span>
              <p className="mt-0.5 text-sm leading-relaxed text-foreground/80">
                {proactiveRecommendation.description}
              </p>
              {recommendationError ? (
                <p role="alert" data-testid="rec-failed-message" className="mt-1 text-xs text-destructive">
                  {t('recommendationFailed')}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {recommendationApplied ? (
              <span
                data-testid="rec-applied-badge"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-success"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {t('recommendationApplied')}
              </span>
            ) : (
              <button
                type="button"
                data-testid="apply-funnel-rec-btn"
                disabled={!canExecute || isApplyingRec}
                onClick={handleApplyRecommendation}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t('applyRecommendationButton')}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. Sub-Navigation Tabs */}
      <div role="tablist" aria-label={t('cockpitTitle')} className="flex w-full flex-wrap gap-1 rounded-2xl border border-border bg-muted/40 p-1 sm:w-fit">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={tab.testId}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors sm:flex-none',
                active ? 'bg-card text-primary shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{tab.label}</span>
              {tab.count !== undefined ? (
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'funnel' && (
        <div className="flex flex-col gap-6" data-testid="funnel-tab-content">
          {funnelMeasured ? (
            <>
              <ChartCard title={t('flowTitle')} description={t('flowDescription')} icon={Workflow}>
                <FlowDiagram nodes={funnelFlow.nodes} edges={funnelFlow.edges} label={t('flowTitle')} height={240} />
              </ChartCard>

              <div className="grid gap-6 lg:grid-cols-5">
                <ChartCard title={t('conversionChartTitle')} description={t('conversionChartDescription')} icon={BarChart3} className="lg:col-span-3" fill>
                  <TrendChart
                    label={t('conversionChartTitle')}
                    xKey="step"
                    data={conversionRows}
                    series={[{ key: 'conversion', label: t('conversionSeries') }]}
                    kind="bar"
                    valueFormat="percent"
                  />
                </ChartCard>
                <ChartCard title={t('lossesTitle')} description={t('lossesDescription')} icon={TrendingDown} className="lg:col-span-2" fill>
                  {funnelLosses.length > 0 ? (
                    <BarList
                      color="hsl(var(--destructive))"
                      items={funnelLosses.map((loss) => ({
                        key: loss.key,
                        label: t('lossesRowLabel', { from: funnelStepLabel(loss.from), to: funnelStepLabel(loss.to) }),
                        sublabel: t('lossesRowSublabel', { percent: loss.percent }),
                        value: loss.lost,
                      }))}
                      valueFormatter={(value) => tFunnel('peopleCount', { count: value })}
                    />
                  ) : (
                    <EmptyState compact icon={CheckCircle2} title={t('lossesNone')} />
                  )}
                </ChartCard>
              </div>

              <VisualFunnelSteps
                steps={funnelSteps}
                funnelName={projectName}
                onAskCopilot={proactiveRecommendation && canExecute ? handleApplyRecommendation : undefined}
              />
            </>
          ) : (
            <EmptySection
              testId="funnel-empty-state"
              icon={Layers}
              title={funnelViewKind === 'no_funnel' ? t('funnelEmptyTitle') : t('funnelUnavailableTitle')}
              body={t(`funnelUnavailable.${funnelViewKind === 'ok' ? 'no_funnel' : funnelViewKind}`)}
              action={
                funnelViewKind === 'no_funnel' || funnelViewKind === 'ok' ? (
                  <Link
                    href={`${projectBase}/onboarding`}
                    data-testid="define-funnel-link"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
                  >
                    {t('defineFunnelCta')}
                  </Link>
                ) : undefined
              }
            />
          )}
        </div>
      )}

      {activeTab === 'goals' && (
        <div className="flex flex-col gap-6" data-testid="goals-tab-content">
          {goals.length > 0 ? (
            <div className="grid gap-6 lg:grid-cols-5">
              <ChartCard title={t('goalsMixTitle')} description={t('goalsMixDescription')} icon={PieChart} className="lg:col-span-2" fill>
                <DonutChart
                  label={t('goalsMixTitle')}
                  layout="side"
                  size={150}
                  centerValue={String(goals.length)}
                  centerLabel={t('goalsMixCenter')}
                  data={GOAL_MIX_ORDER.filter((key) => goalMix[key] > 0).map((key) => ({ label: t(`goalsMix.${key}`), value: goalMix[key], color: GOAL_MIX_COLORS[key] }))}
                />
              </ChartCard>
              <ChartCard title={t('goalsProgressTitle')} description={t('goalsProgressDescription')} icon={Gauge} className="lg:col-span-3" fill>
                {measuredGoals.length > 0 ? (
                  <BarList
                    color="hsl(var(--success))"
                    items={measuredGoals.map((goal) => ({
                      key: goal.id,
                      label: goal.name,
                      sublabel: goal.status ? tGoals(`paceStatus.${goal.status}`) : goal.metricName,
                      value: goal.percentFilled ?? 0,
                      href: `${projectBase}/goals/${goal.id}`,
                    }))}
                    valueFormatter={(value) => `${value}%`}
                  />
                ) : (
                  <EmptyState compact icon={Gauge} title={t('goalsProgressNone')} />
                )}
              </ChartCard>
            </div>
          ) : null}

          {/* Goals Header Bar & Filter Controls */}
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  type="text"
                  data-testid="search-goals-input"
                  placeholder={tGoals('searchPlaceholder')}
                  aria-label={tGoals('searchPlaceholder')}
                  value={goalSearchQuery}
                  onChange={(e) => setGoalSearchQuery(e.target.value)}
                  className="h-9 w-64 max-w-full rounded-xl border border-input bg-background pe-3 ps-9 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <select
                data-testid="filter-goals-status"
                value={goalStatusFilter}
                aria-label={tGoals('filterStatusAll')}
                onChange={(e) => setGoalStatusFilter(e.target.value as 'all' | 'on_track' | 'at_risk' | 'off_track')}
                className="h-9 rounded-xl border border-input bg-background px-3 text-xs"
              >
                <option value="all">{tGoals('filterStatusAll')}</option>
                <option value="on_track">{tGoals('filterStatusOnTrack')}</option>
                <option value="at_risk">{tGoals('filterStatusAtRisk')}</option>
                <option value="off_track">{tGoals('filterStatusOffTrack')}</option>
              </select>
            </div>

            {canExecute && (
              <button
                type="button"
                data-testid="create-new-goal-btn"
                onClick={() => setIsCreateGoalOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>{tGoals('createHeading')}</span>
              </button>
            )}
          </div>

          {/* Goals Thermometer Cards Grid */}
          {goals.length === 0 ? (
            <EmptySection
              testId="goals-empty-state"
              icon={Target}
              title={t('goalsEmptyTitle')}
              body={t('goalsEmptyBody')}
              action={
                <Link
                  href={`${projectBase}/goals`}
                  data-testid="goals-page-link"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  {t('goalsEmptyCta')}
                </Link>
              }
            />
          ) : filteredGoals.length === 0 ? (
            <EmptySection testId="empty-goals" icon={Target} title={t('goalsNoMatch')} />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2" data-testid="goals-cards-grid">
              {/*
                No `onOptimizeRequested`: the card's "AI Copilot recommends budget reallocation"
                callout used to be wired to the FUNNEL recommendation's apply handler, so it
                claimed a budget recommendation nothing had computed and, when clicked, either
                did nothing or fired an unrelated funnel action.
              */}
              {filteredGoals.map((goal) => (
                <GoalThermometerCard
                  key={goal.id}
                  orgId={orgId}
                  projectId={projectId}
                  goal={goal}
                  canExecute={canExecute}
                  onTargetUpdated={handleTargetUpdated}
                />
              ))}
            </div>
          )}

          {/* Goal Creation Modal */}
          <CreateGoalModal
            orgId={orgId}
            projectId={projectId}
            isOpen={isCreateGoalOpen}
            onClose={() => setIsCreateGoalOpen(false)}
            metricCatalog={metricCatalog}
            people={people}
            onGoalCreated={(newGoal) => {
              setGoals((prev) => [newGoal, ...prev]);
            }}
          />
        </div>
      )}

      {activeTab === 'retention' && (
        <div className="flex flex-col gap-6" data-testid="retention-tab-content">
          {cohortRows.length > 0 ? (
            <ChartCard title={t('retentionCurveTitle')} description={t('retentionCurveDescription')} icon={TrendingUp}>
              <TrendChart
                label={t('retentionCurveTitle')}
                xKey="period"
                data={retentionCurve.map((point) => ({ period: tCohort('periodShort', { periodNumber: point.periodNumber }), retention: point.retention }))}
                series={[{ key: 'retention', label: t('retentionCurveSeries') }]}
                kind="area"
                valueFormat="percent"
                height={220}
              />
            </ChartCard>
          ) : null}

          {/* Cohort Heatmap */}
          <CohortRetentionMatrix
            cohorts={cohortRows}
            periodNumbers={cohortPeriodNumbers}
            projectName={projectName}
            viewKind={cohortViewKind}
          />

          {/* Customer Payback Velocity & Intent Calibration */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Payback Velocity */}
            <div data-testid="payback-velocity-section" className="flex">
              <ChartCard title={t('paybackHeading')} description={t('paybackDescription')} icon={Wallet} className="w-full" fill>
                {paybackViewKind === 'ok' && paybackVelocity.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    <TrendChart
                      label={t('paybackHeading')}
                      xKey="window"
                      data={paybackVelocity.map((w) => ({ window: t('paybackWindowShort', { days: w.windowDays }), revenue: w.collectedRevenue }))}
                      series={[{ key: 'revenue', label: t('paybackChartSeries'), color: 'hsl(var(--success))' }]}
                      kind="bar"
                      valueFormat={{ currency: 'USD' }}
                      height={180}
                    />
                    {/*
                      No pace bar: nothing lets a project set a payback target, and the bar used to
                      be filled against an invented `windowDays * 1200` - applied to REAL revenue.
                    */}
                    <p className="text-[11px] text-muted-foreground" data-testid="payback-no-target-note">
                      {t('paybackNoTarget')}
                    </p>
                    <ul className="flex flex-col divide-y divide-border/60 rounded-xl border border-border/60">
                      {paybackVelocity.map((w) => (
                        <li key={w.windowDays} className="flex justify-between px-3 py-2 text-xs font-medium">
                          <span>{t('paybackDayWindow', { days: w.windowDays })}</span>
                          <span className="font-bold text-foreground" dir="ltr" data-testid={`payback-window-${w.windowDays}`}>
                            {`$${w.collectedRevenue.toLocaleString()}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div data-testid="payback-empty-state">
                    <EmptyState compact icon={Wallet} title={sectionUnavailableText(paybackViewKind, t('paybackNoData'))} />
                  </div>
                )}
              </ChartCard>
            </div>

            {/* Quality Calibration */}
            <div data-testid="quality-calibration-section" className="flex">
              <ChartCard title={t('qualityCalibrationHeading')} description={t('qualityCalibrationDescription')} icon={Award} className="w-full" fill>
                {calibrationViewKind === 'ok' && qualityCalibration.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {qualityCalibration.some((q) => q.signups > 0) ? (
                      <DonutChart
                        label={t('qualityCalibrationHeading')}
                        size={130}
                        centerValue={String(qualityCalibration.reduce((sum, q) => sum + q.signups, 0))}
                        centerLabel={t('calibrationMixCenter')}
                        data={qualityCalibration.map((q) => ({ label: q.tierLabel, value: q.signups }))}
                      />
                    ) : null}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground">
                            <th className="py-2 text-start">{t('qualityTier')}</th>
                            <th className="py-2 text-end">{t('signups')}</th>
                            <th className="py-2 text-end">{t('payingRate')}</th>
                            <th className="py-2 text-end">{t('avg40dRevenue')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {qualityCalibration.map((q) => (
                            <tr key={q.tier} className="border-b border-border/50">
                              <td className="py-2 font-medium">{q.tierLabel}</td>
                              <td className="py-2 text-end" dir="ltr">{q.signups}</td>
                              <td className="py-2 text-end font-semibold text-success" dir="ltr">
                                {pct(q.payingRatePercent)}
                              </td>
                              <td className="py-2 text-end font-bold" dir="ltr">
                                {q.avgCollectedRevenue40d === null ? noData : `$${q.avgCollectedRevenue40d}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div data-testid="calibration-empty-state">
                    <EmptyState compact icon={Award} title={sectionUnavailableText(calibrationViewKind, t('calibrationNoData'))} />
                  </div>
                )}
              </ChartCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
