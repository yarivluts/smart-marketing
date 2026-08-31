'use client';

import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  Plus,
  Search,
  Target,
} from 'lucide-react';
import type { GoalItem, CohortHeatmapRow, PaybackVelocityItem, QualityCalibrationItem } from './goal-types';
import { GoalThermometerCard } from './goal-thermometer-card';
import { CohortRetentionHeatmap } from './cohort-retention-heatmap';
import { PaybackVelocityCard } from './payback-velocity-card';
import { IntentQualityCalibration } from './intent-quality-calibration';
import { CreateGoalModal } from './create-goal-modal';

export interface GoalsDashboardProps {
  initialGoals?: GoalItem[];
  cohorts?: CohortHeatmapRow[];
  paybackWindows?: PaybackVelocityItem[];
  qualityTiers?: QualityCalibrationItem[];
  canExecute?: boolean;
  onAskCopilot?: (goal?: GoalItem) => void;
  className?: string;
}

export const DEFAULT_GOALS: GoalItem[] = [
  {
    id: 'goal-1',
    name: 'Q3 Enterprise Signups',
    metricKey: 'signups',
    metricLabel: 'Enterprise Signups',
    direction: 'maximize',
    targetValue: 500,
    actualValue: 320,
    startDate: '2026-07-01',
    deadline: '2026-09-30',
    rhythm: 'even',
    ownerName: 'Sarah Connor',
  },
  {
    id: 'goal-2',
    name: 'Blended Paid CAC Ceiling',
    metricKey: 'cac',
    metricLabel: 'Blended CAC',
    direction: 'minimize',
    targetValue: 45,
    actualValue: 38,
    startDate: '2026-07-01',
    deadline: '2026-09-30',
    rhythm: 'even',
    ownerName: 'Alex Mercer',
  },
  {
    id: 'goal-3',
    name: 'Weekly Active Workspace Users',
    metricKey: 'wau',
    metricLabel: 'WAU',
    direction: 'maximize',
    targetValue: 2000,
    actualValue: 1100,
    startDate: '2026-07-01',
    deadline: '2026-09-30',
    rhythm: 'even',
    ownerName: 'Dana Scully',
  },
];

export function GoalsDashboard({
  initialGoals = DEFAULT_GOALS,
  cohorts,
  paybackWindows,
  qualityTiers,
  canExecute = true,
  onAskCopilot,
  className = '',
}: GoalsDashboardProps): React.ReactElement {
  const t = useTranslations('Goals');

  const [goals, setGoals] = useState<GoalItem[]>(initialGoals);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'on_track' | 'at_risk' | 'off_track'>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Filter goals by search query and status filter
  const filteredGoals = useMemo(() => {
    return goals.filter((goal) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        goal.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        goal.metricLabel.toLowerCase().includes(searchQuery.toLowerCase());

      const status = goal.progress?.status ?? (goal.actualValue >= goal.targetValue * 0.6 ? 'on_track' : 'off_track');
      const matchesStatus = statusFilter === 'all' || status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [goals, searchQuery, statusFilter]);

  const handleTargetUpdated = (goalId: string, newTarget: number) => {
    setGoals((prev) =>
      prev.map((g) => (g.id === goalId ? { ...g, targetValue: newTarget } : g)),
    );
  };

  const handleDeleteGoal = (goalId: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== goalId));
  };

  const handleGoalCreated = (newGoal: GoalItem) => {
    setGoals((prev) => [newGoal, ...prev]);
  };

  const onTrackCount = goals.filter((g) => (g.progress?.status ?? 'on_track') === 'on_track').length;
  const atRiskCount = goals.filter((g) => (g.progress?.status ?? 'on_track') === 'at_risk').length;

  return (
    <div data-testid="goals-dashboard" className={`flex flex-col gap-8 ${className}`}>
      {/* Top Header & KPI Summary */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {t('cockpitTitle')}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('cockpitSubtitle')}
            </p>
          </div>

          {canExecute && (
            <button
              type="button"
              data-testid="create-new-goal-btn"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all cursor-pointer shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>{t('createHeading')}</span>
            </button>
          )}
        </div>

        {/* KPI Scorecards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
            <span className="text-xs text-muted-foreground font-medium">{t('kpiTotalGoals')}</span>
            <p className="text-2xl font-bold text-foreground mt-1" dir="ltr">
              {goals.length}
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
            <span className="text-xs text-muted-foreground font-medium">{t('kpiOnTrack')}</span>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1" dir="ltr">
              {onTrackCount}
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
            <span className="text-xs text-muted-foreground font-medium">{t('kpiAtRisk')}</span>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1" dir="ltr">
              {atRiskCount}
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
            <span className="text-xs text-muted-foreground font-medium">Avg Pace Ratio</span>
            <p className="text-2xl font-bold text-primary mt-1" dir="ltr">
              104.2%
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              data-testid="search-goals-input"
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-64 rounded-lg border border-input bg-background ps-9 pe-3 text-xs"
            />
          </div>

          <select
            data-testid="filter-goals-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'on_track' | 'at_risk' | 'off_track')}
            className="h-9 rounded-lg border border-input bg-background px-3 text-xs"
          >
            <option value="all">{t('filterStatusAll')}</option>
            <option value="on_track">{t('filterStatusOnTrack')}</option>
            <option value="at_risk">{t('filterStatusAtRisk')}</option>
            <option value="off_track">{t('filterStatusOffTrack')}</option>
          </select>
        </div>
      </div>

      {/* Goals Cards Grid */}
      {filteredGoals.length === 0 ? (
        <div
          data-testid="empty-goals"
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground"
        >
          <Target className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm font-medium">{t('noGoals')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="goals-cards-grid">
          {filteredGoals.map((goal) => (
            <GoalThermometerCard
              key={goal.id}
              goal={goal}
              canExecute={canExecute}
              onTargetUpdated={handleTargetUpdated}
              onDeleteRequested={handleDeleteGoal}
              onOptimizeRequested={(g) => onAskCopilot?.(g)}
            />
          ))}
        </div>
      )}

      {/* Cohort Retention Heatmap Matrix */}
      <CohortRetentionHeatmap cohorts={cohorts} />

      {/* Payback Velocity & Intent Quality Calibration Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PaybackVelocityCard windows={paybackWindows} />
        <IntentQualityCalibration tiers={qualityTiers} />
      </div>

      {/* Goal Creation Modal */}
      <CreateGoalModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onGoalCreated={handleGoalCreated}
      />
    </div>
  );
}
