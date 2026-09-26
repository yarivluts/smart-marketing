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
} from 'lucide-react';
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

export interface FunnelGoalsDashboardProps {
  orgId: string;
  projectId: string;
  projectName: string;
  cockpitData: FunnelGoalsCockpitData;
  canExecute: boolean;
  metricCatalog?: { name: string; unit?: string }[];
  people?: { id: string; name: string }[];
}

/** Shared dashed-border empty state: what is missing, and (optionally) how to get it. */
function EmptySection({
  testId,
  title,
  body,
  action,
  icon: Icon,
}: {
  testId: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
}): React.ReactElement {
  return (
    <div
      data-testid={testId}
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground"
    >
      <Icon className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {body ? <p className="max-w-md text-xs">{body}</p> : null}
      {action}
    </div>
  );
}

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
  /*
    Every KPI below is nullable and renders "No data" when unmeasured. Nothing on this page is
    ever filled in when the project has not measured it: with no funnel, no goals, or no landed
    warehouse data, each section says what is missing instead of showing a sample (see
    funnel-goals-synthesizer.ts's data-honesty contract).
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

  return (
    <div className="flex flex-col gap-8 pb-16" data-testid="funnel-goals-dashboard">
      {/* Top Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t('cockpitTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('cockpitDescription')}
          </p>
        </div>
      </div>

      {/* 1. Executive Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6" data-testid="kpi-metric-cards">
        {/* Overall Conversion */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">{t('kpiOverallConversion')}</span>
            <Target className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground" dir="ltr" data-testid="kpi-overall-conversion">
            {pct(summary.overallFunnelConversionPct)}
          </div>
          {/* B22: a rate on 4 people looks exactly like a rate on 40,000 unless it says otherwise. */}
          {summary.funnelEntrants !== null && summary.funnelEntrants > 0 && summary.funnelEntrants < MIN_FUNNEL_ENTRANTS_FOR_ALERT ? (
            <span className="mt-1 text-[11px] text-amber-600 dark:text-amber-400" data-testid="kpi-overall-conversion-low-sample">
              {t('kpiLowSample', { count: summary.funnelEntrants })}
            </span>
          ) : null}
        </div>

        {/* Goals on Track - out of the goals that were actually measured */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">{t('kpiGoalsOnTrack')}</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-xl font-bold text-emerald-600 dark:text-emerald-400" dir="ltr" data-testid="kpi-goals-on-track">
            {summary.goalsMeasuredCount === 0
              ? noData
              : `${summary.goalsOnTrackCount} / ${summary.goalsMeasuredCount}`}
          </div>
          {summary.goalsPausedCount > 0 ? (
            <span className="mt-1 text-[11px] text-muted-foreground" data-testid="kpi-goals-paused">
              {t('kpiGoalsPaused', { count: summary.goalsPausedCount })}
            </span>
          ) : null}
        </div>

        {/* M1 Retention Rate */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">{t('kpiM1Retention')}</span>
            <Users className="h-4 w-4 text-blue-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground" dir="ltr">
            {pct(summary.avgMonth1RetentionPct)}
          </div>
        </div>

        {/* Conversion Velocity */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">{t('kpiConversionVelocity')}</span>
            <Clock className="h-4 w-4 text-indigo-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground" dir="ltr">
            {summary.avgConversionVelocityDays === null ? noData : `${summary.avgConversionVelocityDays} ${t('daysUnit')}`}
          </div>
          <span className="mt-1 text-[10px] text-muted-foreground">
            {t('kpiTimeToSign')}
          </span>
        </div>

        {/* 40d Payback Revenue */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">{t('kpiPaybackRevenue')}</span>
            <Activity className="h-4 w-4 text-amber-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground" dir="ltr">
            {summary.total40dPaybackUsd === null ? noData : `$${summary.total40dPaybackUsd.toLocaleString()}`}
          </div>
        </div>

        {/* Dunning & Churn */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">{t('kpiDunningRecovery')}</span>
            <ShieldCheck className="h-4 w-4 text-purple-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-xl font-bold text-emerald-600 dark:text-emerald-400" dir="ltr">
            {pct(summary.dunningRecoveryRatePct)}
          </div>
          {summary.churnRatePct === null ? null : (
            <span className="mt-1 text-[10px] text-muted-foreground">
              {t('kpiChurnRate', { rate: summary.churnRatePct })}
            </span>
          )}
        </div>
      </div>

      {/* 2. In-Context Proactive Recommendation - only ever built from a measured funnel */}
      {proactiveRecommendation && (
        <div
          data-testid="proactive-recommendation-card"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-accent/5 to-primary/10 p-4 shadow-xs"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                {t('proactiveRecommendationHeading')}
              </span>
              <p className="text-xs text-foreground/80 leading-relaxed mt-0.5">
                {proactiveRecommendation.description}
              </p>
              {recommendationError ? (
                <p role="alert" data-testid="rec-failed-message" className="mt-1 text-xs text-destructive">
                  {t('recommendationFailed')}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {recommendationApplied ? (
              <span
                data-testid="rec-applied-badge"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400"
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t('applyRecommendationButton')}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. Sub-Navigation Tabs */}
      <div className="flex border-b border-border">
        <div className="flex gap-4">
          <button
            type="button"
            data-testid="tab-funnel-btn"
            onClick={() => setActiveTab('funnel')}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'funnel'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Layers className="h-4 w-4" aria-hidden="true" />
            <span>{t('tabFunnel')}</span>
          </button>

          <button
            type="button"
            data-testid="tab-goals-btn"
            onClick={() => setActiveTab('goals')}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'goals'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Target className="h-4 w-4" aria-hidden="true" />
            <span>{t('tabGoals')}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {goals.length}
            </span>
          </button>

          <button
            type="button"
            data-testid="tab-retention-btn"
            onClick={() => setActiveTab('retention')}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'retention'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Activity className="h-4 w-4" aria-hidden="true" />
            <span>{t('tabRetention')}</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'funnel' && (
        <div className="flex flex-col gap-6" data-testid="funnel-tab-content">
          {funnelViewKind === 'ok' && funnelSteps.length > 0 ? (
            <VisualFunnelSteps
              steps={funnelSteps}
              funnelName={projectName}
              onAskCopilot={proactiveRecommendation && canExecute ? handleApplyRecommendation : undefined}
            />
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
                    className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90"
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
          {/* Goals Header Bar & Filter Controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  data-testid="search-goals-input"
                  placeholder={tGoals('searchPlaceholder')}
                  value={goalSearchQuery}
                  onChange={(e) => setGoalSearchQuery(e.target.value)}
                  className="h-9 w-64 rounded-lg border border-input bg-background ps-9 pe-3 text-xs"
                />
              </div>

              <select
                data-testid="filter-goals-status"
                value={goalStatusFilter}
                onChange={(e) => setGoalStatusFilter(e.target.value as 'all' | 'on_track' | 'at_risk' | 'off_track')}
                className="h-9 rounded-lg border border-input bg-background px-3 text-xs"
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
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all cursor-pointer"
              >
                <Plus className="h-4 w-4" />
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
                  className="mt-1 text-xs font-semibold text-primary hover:underline"
                >
                  {t('goalsEmptyCta')}
                </Link>
              }
            />
          ) : filteredGoals.length === 0 ? (
            <div
              data-testid="empty-goals"
              className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground"
            >
              <Target className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium">{t('goalsNoMatch')}</p>
            </div>
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
        <div className="flex flex-col gap-8" data-testid="retention-tab-content">
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
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-xs" data-testid="payback-velocity-section">
              <h3 className="text-base font-bold text-foreground">{t('paybackHeading')}</h3>
              <p className="text-xs text-muted-foreground">{t('paybackDescription')}</p>
              {paybackViewKind === 'ok' && paybackVelocity.length > 0 ? (
                <div className="flex flex-col gap-3 pt-2">
                  {/*
                    No pace bar: nothing lets a project set a payback target, and the bar used to
                    be filled against an invented `windowDays * 1200` - applied to REAL revenue.
                  */}
                  <p className="text-[11px] text-muted-foreground" data-testid="payback-no-target-note">
                    {t('paybackNoTarget')}
                  </p>
                  {paybackVelocity.map((w) => (
                    <div key={w.windowDays} className="flex justify-between text-xs font-medium">
                      <span>{t('paybackDayWindow', { days: w.windowDays })}</span>
                      <span className="font-bold text-foreground" dir="ltr" data-testid={`payback-window-${w.windowDays}`}>
                        {`$${w.collectedRevenue.toLocaleString()}`}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p
                  data-testid="payback-empty-state"
                  className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground"
                >
                  {sectionUnavailableText(paybackViewKind, t('paybackNoData'))}
                </p>
              )}
            </div>

            {/* Quality Calibration */}
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-xs" data-testid="quality-calibration-section">
              <h3 className="text-base font-bold text-foreground">{t('qualityCalibrationHeading')}</h3>
              <p className="text-xs text-muted-foreground">{t('qualityCalibrationDescription')}</p>
              {calibrationViewKind === 'ok' && qualityCalibration.length > 0 ? (
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
                          <td className="py-2 text-end font-semibold text-emerald-600 dark:text-emerald-400" dir="ltr">
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
              ) : (
                <p
                  data-testid="calibration-empty-state"
                  className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground"
                >
                  {sectionUnavailableText(calibrationViewKind, t('calibrationNoData'))}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
