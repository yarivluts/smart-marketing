'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Target,
  TrendingUp,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  Clock,
  Flame,
  ShieldCheck,
  Compass,
} from 'lucide-react';
import { MarketingEmptyState } from '@/components/orgs/marketing-empty-state';

export type GrowthGoalPreset = 'scale' | 'profit' | 'lead_gen';

export interface SerializedGoal {
  id: string;
  name: string;
  metricName: string;
  direction: string;
  targetValue: number | null;
  startDate: string;
  deadline: string;
  rhythm: string;
  currentValue?: number | null;
  progressPct?: number | null;
  pacingNote?: string | null;
  status?: string;
}

export function MarketingGoalsDashboard({
  projectName,
  goals = [],
}: {
  projectName: string;
  goals?: SerializedGoal[];
}) {
  const t = useTranslations('MarketingGoals');
  const [activePreset, setActivePreset] = useState<GrowthGoalPreset>('profit');

  if (goals.length === 0) {
    return (
      <MarketingEmptyState
        Icon={Target}
        heading={t('emptyStateHeading', { projectName })}
        description={t('emptyStateDesc')}
        ctaLabel={t('emptyStateCta')}
      />
    );
  }

  // Calculate days left to deadline
  const getDaysLeft = (deadlineStr: string) => {
    const deadline = new Date(deadlineStr);
    const today = new Date();
    const diffTime = deadline.getTime() - today.getTime();
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(days, 0);
  };

  const formatTarget = (metricName: string, value: number | null, direction: string) => {
    if (value === null) return '-';
    const prefix = direction === 'at_most' ? '< ' : '';
    if (metricName.includes('roas')) return `${prefix}${value.toFixed(2)}x`;
    if (metricName.includes('revenue') || metricName.includes('recovery')) {
      return `${prefix}₪${value.toLocaleString()}`;
    }
    if (metricName.includes('cac')) return `${prefix}₪${value.toFixed(2)}`;
    if (metricName.includes('cvr') || metricName.includes('rate')) {
      return `${prefix}${value.toFixed(1)}%`;
    }
    return `${prefix}${value.toLocaleString()}`;
  };

  const formatCurrent = (metricName: string, value: number | null | undefined) => {
    if (value === null || value === undefined) return '-';
    if (metricName.includes('roas')) return `${value.toFixed(2)}x`;
    if (metricName.includes('revenue') || metricName.includes('recovery')) {
      return `₪${value.toLocaleString()}`;
    }
    if (metricName.includes('cac')) return `₪${value.toFixed(2)}`;
    if (metricName.includes('cvr') || metricName.includes('rate')) {
      return `${value.toFixed(1)}%`;
    }
    return `${value.toLocaleString()}`;
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                {t('pageHeading', { projectName })}
              </h1>
              <p className="text-xs text-muted-foreground">{t('pageSubtitle')}</p>
            </div>
          </div>
        </div>

        {/* 1-Click Strategy Presets */}
        <div className="flex items-center gap-1.5 rounded-2xl border border-border bg-background p-1.5 shadow-xs">
          <button
            type="button"
            onClick={() => setActivePreset('profit')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
              activePreset === 'profit'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{t('presetProfitMargin')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActivePreset('scale')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
              activePreset === 'scale'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Flame className="h-3.5 w-3.5 text-amber-500" />
            <span>{t('presetAggressiveScale')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActivePreset('lead_gen')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
              activePreset === 'lead_gen'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Compass className="h-3.5 w-3.5 text-blue-500" />
            <span>{t('presetLeadGen')}</span>
          </button>
        </div>
      </div>

      {/* Preset Explainer Banner */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-semibold text-foreground">
            {t('activeStrategyLabel')}{':'} {t(`presetDesc_${activePreset}` as Parameters<typeof t>[0])}
          </span>
        </div>
        <span className="rounded-full bg-background/80 px-2.5 py-0.5 font-bold text-muted-foreground border border-border text-[11px]">
          {t('autoTrackedOutbox')}
        </span>
      </div>

      {/* Predefined Marketing Goals Grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {goals.map((goal) => {
          const progressPct = goal.progressPct ?? 0;
          const status = goal.status ?? (progressPct >= 100 ? 'ahead' : progressPct >= 70 ? 'on_track' : 'needs_attention');
          const isAhead = status === 'ahead';
          const isNeedsAttention = status === 'needs_attention';
          const daysLeft = getDaysLeft(goal.deadline);

          return (
            <div
              key={goal.id}
              className="flex flex-col justify-between gap-5 rounded-3xl border border-border bg-card p-6 shadow-sm transition-all hover:border-primary/40 hover:shadow-soft"
            >
              {/* Header */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-foreground">
                    {goal.name}
                  </span>
                  <div
                    className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      isAhead
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : isNeedsAttention
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    {isAhead ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : isNeedsAttention ? (
                      <AlertCircle className="h-3 w-3" />
                    ) : (
                      <TrendingUp className="h-3 w-3" />
                    )}
                    <span>{t(`status_${status}` as Parameters<typeof t>[0])}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {goal.metricName}
                </p>
              </div>

              {/* Metric Values & Thermometer Progress */}
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {t('currentValueLabel')}
                    </span>
                    <span className="text-2xl font-black text-foreground">
                      {formatCurrent(goal.metricName, goal.currentValue)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {t('targetValueLabel')}
                    </span>
                    <span className="text-base font-bold text-primary">
                      {formatTarget(goal.metricName, goal.targetValue, goal.direction)}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[11px] font-semibold text-muted-foreground">
                    <span>{t('completionPacing')}</span>
                    <span className="font-bold text-foreground">{progressPct}{'%'}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isAhead
                          ? 'bg-emerald-500'
                          : isNeedsAttention
                          ? 'bg-rose-500'
                          : 'bg-primary'
                      }`}
                      style={{ width: `${Math.min(progressPct, 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Footer / Pacing AI Insight */}
              <div className="flex items-center justify-between border-t border-border/70 pt-3 text-[11px]">
                <span className="flex items-center gap-1 font-semibold text-muted-foreground">
                  <Zap className="h-3 w-3 text-amber-500" />
                  <span>{goal.pacingNote || t('pacingOnTrackRevenue')}</span>
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{daysLeft} {t('daysLeft')}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

