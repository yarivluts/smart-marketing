'use client';

import { useTranslations } from 'next-intl';
import {
  Repeat,
  TrendingUp,
  UserCheck,
  UserMinus,
  DollarSign,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react';
import type { SubscriptionGrowthMetrics } from './types';

interface SubscriptionMetricsCardProps {
  metrics: SubscriptionGrowthMetrics;
  isDemo?: boolean;
}

export function SubscriptionMetricsCard({ metrics }: SubscriptionMetricsCardProps) {
  const t = useTranslations('GrowthDashboard');

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="flex flex-col gap-6 rounded-3xl border border-border bg-card p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Repeat className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight text-foreground">
                {t('subscriptionsTitle')}
              </h3>
              <p className="text-xs text-muted-foreground">{t('subscriptionsSubtitle')}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
          <span>{t('subscriptionEngineActive')}</span>
        </div>
      </div>

      {/* Main SaaS / Subscription KPIs Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {/* MRR */}
        <div className="flex flex-col gap-1 rounded-2xl border border-border/80 bg-background/70 p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <DollarSign className="h-3.5 w-3.5 text-indigo-500" />
            <span>{t('metricMrr')}</span>
          </div>
          <div className="text-xl font-black text-foreground">
            {formatCurrency(metrics.mrr)}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="h-3 w-3" />
            <span>{'+'}{metrics.mrrGrowthRatePct}{'% MoM'}</span>
          </div>
        </div>

        {/* ARR */}
        <div className="flex flex-col gap-1 rounded-2xl border border-border/80 bg-background/70 p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
            <span>{t('metricArr')}</span>
          </div>
          <div className="text-xl font-black text-foreground">
            {formatCurrency(metrics.arr)}
          </div>
          <span className="text-[11px] text-muted-foreground">{t('metricRunRate')}</span>
        </div>

        {/* Trial-to-Paid */}
        <div className="flex flex-col gap-1 rounded-2xl border border-border/80 bg-background/70 p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span>{t('metricTrialToPaid')}</span>
          </div>
          <div className="text-xl font-black text-foreground">
            {metrics.trialToPaidConversionPct}{'%'}
          </div>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            {t('topTierConversion')}
          </span>
        </div>

        {/* Churn Rate */}
        <div className="flex flex-col gap-1 rounded-2xl border border-border/80 bg-background/70 p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <UserMinus className="h-3.5 w-3.5 text-rose-500" />
            <span>{t('metricMonthlyChurn')}</span>
          </div>
          <div className="text-xl font-black text-foreground">
            {metrics.monthlyChurnRatePct}{'%'}
          </div>
          <span className="text-[11px] text-muted-foreground">{t('lowChurnBench')}</span>
        </div>

        {/* LTV & LTV/CAC */}
        <div className="flex flex-col gap-1 rounded-2xl border border-border/80 bg-background/70 p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <DollarSign className="h-3.5 w-3.5 text-amber-500" />
            <span>{t('metricLtv')}</span>
          </div>
          <div className="text-xl font-black text-foreground">
            {formatCurrency(metrics.ltv)}
          </div>
          <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
            {metrics.ltvToCacRatio}{'x LTV/CAC'}
          </span>
        </div>

        {/* CAC Payback Period */}
        <div className="flex flex-col gap-1 rounded-2xl border border-border/80 bg-background/70 p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-purple-500" />
            <span>{t('metricCacPayback')}</span>
          </div>
          <div className="text-xl font-black text-foreground">
            {metrics.cacPaybackMonths} {t('monthsUnit')}
          </div>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            {t('fastPaybackBench')}
          </span>
        </div>
      </div>

      {/* Subscription Tiers Breakdown */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/50 p-4">
        <div className="flex items-center justify-between text-xs font-bold text-foreground">
          <div className="flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-indigo-500" />
            <span>{t('subscriptionTiersHeading')}</span>
          </div>
          <span className="text-muted-foreground">
            {metrics.activeSubscribers.toLocaleString()} {t('totalActiveSubscribers')}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {metrics.tiers.map((tier) => (
            <div
              key={tier.nameKey}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  {t(tier.nameKey as Parameters<typeof t>[0])}
                </span>
                <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                  {tier.mrrSharePct}{'%'} {t('mrrShare')}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted-foreground">
                  {tier.subscribers.toLocaleString()} {t('subscribersLabel')}
                </span>
                <span className="font-semibold text-foreground">
                  {'ARPU: '}{formatCurrency(tier.arpu)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{ width: `${tier.mrrSharePct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
