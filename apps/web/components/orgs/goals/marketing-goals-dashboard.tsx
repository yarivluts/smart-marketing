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

export type GrowthGoalPreset = 'scale' | 'profit' | 'lead_gen';

export interface PredefinedMarketingGoal {
  id: string;
  titleKey: string;
  subtitleKey: string;
  category: 'roas' | 'revenue' | 'cac' | 'trial_cvr' | 'cart_recovery';
  targetValue: string;
  currentValue: string;
  progressPct: number;
  status: 'on_track' | 'ahead' | 'needs_attention';
  pacingNoteKey: string;
  deadlineDaysLeft: number;
}

export function MarketingGoalsDashboard({ projectName }: { projectName: string }) {
  const t = useTranslations('MarketingGoals');

  const [activePreset, setActivePreset] = useState<GrowthGoalPreset>('profit');

  const goalsByPreset: Record<GrowthGoalPreset, PredefinedMarketingGoal[]> = {
    profit: [
      {
        id: 'goal-roas',
        titleKey: 'goalRoasTitle',
        subtitleKey: 'goalRoasSubtitle',
        category: 'roas',
        targetValue: '4.00x',
        currentValue: '3.84x',
        progressPct: 96,
        status: 'ahead',
        pacingNoteKey: 'pacingAheadNote',
        deadlineDaysLeft: 14,
      },
      {
        id: 'goal-revenue',
        titleKey: 'goalRevenueTitle',
        subtitleKey: 'goalRevenueSubtitle',
        category: 'revenue',
        targetValue: '₪100,000',
        currentValue: '₪95,420',
        progressPct: 95,
        status: 'on_track',
        pacingNoteKey: 'pacingOnTrackRevenue',
        deadlineDaysLeft: 7,
      },
      {
        id: 'goal-cac',
        titleKey: 'goalCacTitle',
        subtitleKey: 'goalCacSubtitle',
        category: 'cac',
        targetValue: '< ₪60.00',
        currentValue: '₪60.31',
        progressPct: 99,
        status: 'on_track',
        pacingNoteKey: 'pacingOptimalCac',
        deadlineDaysLeft: 21,
      },
      {
        id: 'goal-trial-cvr',
        titleKey: 'goalTrialCvrTitle',
        subtitleKey: 'goalTrialCvrSubtitle',
        category: 'trial_cvr',
        targetValue: '15.0%',
        currentValue: '14.8%',
        progressPct: 98,
        status: 'ahead',
        pacingNoteKey: 'pacingHighTrialNote',
        deadlineDaysLeft: 30,
      },
      {
        id: 'goal-cart-recovery',
        titleKey: 'goalCartRecoveryTitle',
        subtitleKey: 'goalCartRecoverySubtitle',
        category: 'cart_recovery',
        targetValue: '25.0%',
        currentValue: '26.4%',
        progressPct: 105,
        status: 'ahead',
        pacingNoteKey: 'pacingExceedingCartRecovery',
        deadlineDaysLeft: 18,
      },
    ],
    scale: [
      {
        id: 'goal-roas',
        titleKey: 'goalRoasTitle',
        subtitleKey: 'goalRoasSubtitle',
        category: 'roas',
        targetValue: '3.20x',
        currentValue: '3.84x',
        progressPct: 120,
        status: 'ahead',
        pacingNoteKey: 'pacingAggressiveScale',
        deadlineDaysLeft: 14,
      },
      {
        id: 'goal-revenue',
        titleKey: 'goalRevenueTitle',
        subtitleKey: 'goalRevenueSubtitle',
        category: 'revenue',
        targetValue: '₪180,000',
        currentValue: '₪95,420',
        progressPct: 53,
        status: 'on_track',
        pacingNoteKey: 'pacingScalingVelocity',
        deadlineDaysLeft: 25,
      },
      {
        id: 'goal-cac',
        titleKey: 'goalCacTitle',
        subtitleKey: 'goalCacSubtitle',
        category: 'cac',
        targetValue: '< ₪85.00',
        currentValue: '₪60.31',
        progressPct: 100,
        status: 'ahead',
        pacingNoteKey: 'pacingCacRoomToScale',
        deadlineDaysLeft: 25,
      },
      {
        id: 'goal-trial-cvr',
        titleKey: 'goalTrialCvrTitle',
        subtitleKey: 'goalTrialCvrSubtitle',
        category: 'trial_cvr',
        targetValue: '12.0%',
        currentValue: '14.8%',
        progressPct: 123,
        status: 'ahead',
        pacingNoteKey: 'pacingHighTrialNote',
        deadlineDaysLeft: 30,
      },
      {
        id: 'goal-cart-recovery',
        titleKey: 'goalCartRecoveryTitle',
        subtitleKey: 'goalCartRecoverySubtitle',
        category: 'cart_recovery',
        targetValue: '20.0%',
        currentValue: '26.4%',
        progressPct: 132,
        status: 'ahead',
        pacingNoteKey: 'pacingExceedingCartRecovery',
        deadlineDaysLeft: 18,
      },
    ],
    lead_gen: [
      {
        id: 'goal-roas',
        titleKey: 'goalRoasTitle',
        subtitleKey: 'goalRoasSubtitle',
        category: 'roas',
        targetValue: '2.50x',
        currentValue: '3.84x',
        progressPct: 153,
        status: 'ahead',
        pacingNoteKey: 'pacingAheadNote',
        deadlineDaysLeft: 14,
      },
      {
        id: 'goal-revenue',
        titleKey: 'goalRevenueTitle',
        subtitleKey: 'goalRevenueSubtitle',
        category: 'revenue',
        targetValue: '₪80,000',
        currentValue: '₪95,420',
        progressPct: 119,
        status: 'ahead',
        pacingNoteKey: 'pacingOnTrackRevenue',
        deadlineDaysLeft: 10,
      },
      {
        id: 'goal-cac',
        titleKey: 'goalCacTitle',
        subtitleKey: 'goalCacSubtitle',
        category: 'cac',
        targetValue: '< ₪45.00',
        currentValue: '₪60.31',
        progressPct: 75,
        status: 'needs_attention',
        pacingNoteKey: 'pacingNeedsAttentionCac',
        deadlineDaysLeft: 15,
      },
      {
        id: 'goal-trial-cvr',
        titleKey: 'goalTrialCvrTitle',
        subtitleKey: 'goalTrialCvrSubtitle',
        category: 'trial_cvr',
        targetValue: '18.0%',
        currentValue: '14.8%',
        progressPct: 82,
        status: 'on_track',
        pacingNoteKey: 'pacingHighTrialNote',
        deadlineDaysLeft: 20,
      },
      {
        id: 'goal-cart-recovery',
        titleKey: 'goalCartRecoveryTitle',
        subtitleKey: 'goalCartRecoverySubtitle',
        category: 'cart_recovery',
        targetValue: '30.0%',
        currentValue: '26.4%',
        progressPct: 88,
        status: 'on_track',
        pacingNoteKey: 'pacingExceedingCartRecovery',
        deadlineDaysLeft: 18,
      },
    ],
  };

  const activeGoals = goalsByPreset[activePreset];

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
        {activeGoals.map((goal) => {
          const isAhead = goal.status === 'ahead';
          const isNeedsAttention = goal.status === 'needs_attention';

          return (
            <div
              key={goal.id}
              className="flex flex-col justify-between gap-5 rounded-3xl border border-border bg-card p-6 shadow-sm transition-all hover:border-primary/40 hover:shadow-soft"
            >
              {/* Header */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-foreground">
                    {t(goal.titleKey as Parameters<typeof t>[0])}
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
                    <span>{t(`status_${goal.status}` as Parameters<typeof t>[0])}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(goal.subtitleKey as Parameters<typeof t>[0])}
                </p>
              </div>

              {/* Metric Values & Thermometer Progress */}
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {t('currentValueLabel')}
                    </span>
                    <span className="text-2xl font-black text-foreground">{goal.currentValue}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {t('targetValueLabel')}
                    </span>
                    <span className="text-base font-bold text-primary">{goal.targetValue}</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[11px] font-semibold text-muted-foreground">
                    <span>{t('completionPacing')}</span>
                    <span className="font-bold text-foreground">{goal.progressPct}{'%'}</span>
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
                      style={{ width: `${Math.min(goal.progressPct, 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Footer / Pacing AI Insight */}
              <div className="flex items-center justify-between border-t border-border/70 pt-3 text-[11px]">
                <span className="flex items-center gap-1 font-semibold text-muted-foreground">
                  <Zap className="h-3 w-3 text-amber-500" />
                  <span>{t(goal.pacingNoteKey as Parameters<typeof t>[0])}</span>
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{goal.deadlineDaysLeft} {t('daysLeft')}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
