'use client';

import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Clock,
  ShieldCheck,
  Sparkles,
  PieChart,
  ArrowRight,
} from 'lucide-react';
import {
  type ExecutiveBlendedMetrics,
  type ExecutiveTimeWindow,
  buildExecutiveReportData,
} from '@/lib/orgs/executive-reporting-synthesizer';
import type { AutomationTargetView } from '@/lib/orgs/automation-view';
import type { CampaignSpendBreakdownOutcome } from '@/lib/orgs/queries';

export interface ExecutiveBlendedReportProps {
  metrics?: ExecutiveBlendedMetrics;
  initialMetrics?: ExecutiveBlendedMetrics;
  targets?: AutomationTargetView[];
  spendOutcome?: CampaignSpendBreakdownOutcome | null;
  seed?: string;
  canExecute?: boolean;
  onApplyRecommendation?: () => void;
  className?: string;
}

export function ExecutiveBlendedReport({
  metrics: externalMetrics,
  initialMetrics,
  targets = [],
  spendOutcome = null,
  seed = 'default-project',
  canExecute = false,
  onApplyRecommendation,
  className = '',
}: ExecutiveBlendedReportProps): React.ReactElement {
  const t = useTranslations('ExecutiveReport');

  const [timeWindow, setTimeWindow] = useState<ExecutiveTimeWindow>('30d');
  const [selectedChannel, setSelectedChannel] = useState<'all' | 'meta_ads' | 'google_ads'>('all');

  const reportData = useMemo(() => {
    if (externalMetrics) {
      return buildExecutiveReportData({
        overrides: externalMetrics,
        timeWindow,
        seed,
      });
    }
    return buildExecutiveReportData({
      targets,
      spendOutcome,
      timeWindow,
      seed,
      overrides: initialMetrics,
    });
  }, [externalMetrics, initialMetrics, targets, spendOutcome, timeWindow, seed]);

  const { metrics, channels, rebalancingRecommendation } = reportData;

  const isSpendPositive = metrics.periodComparison.spendChangePct >= 0;
  const isCacReduced = metrics.periodComparison.cacChangePct <= 0; // Negative CAC change is positive cost reduction
  const isRoasPositive = metrics.periodComparison.roasChangePct >= 0;

  return (
    <div
      data-testid="executive-blended-report"
      className={`flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 shadow-xs ${className}`}
    >
      {/* 1. Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {t('title', { defaultMessage: 'Executive Growth & Performance Overview' })}
            </h2>
            <span
              data-testid="zero-config-badge"
              className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-950 dark:text-green-300"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {t('liveBadge', { defaultMessage: 'Live Blended Pipeline' })}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            {t('subtitle', { defaultMessage: 'Zero-configuration blended analytics across Meta & Google Ads' })}
          </p>
        </div>

        {/* Time Window Filter Pills */}
        <div className="flex items-center rounded-lg border border-border bg-muted/50 p-1">
          <button
            type="button"
            onClick={() => setTimeWindow('7d')}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
              timeWindow === '7d'
                ? 'bg-background text-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('window7d', { defaultMessage: '7 Days' })}
          </button>
          <button
            type="button"
            onClick={() => setTimeWindow('30d')}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
              timeWindow === '30d'
                ? 'bg-background text-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('window30d', { defaultMessage: '30 Days' })}
          </button>
          <button
            type="button"
            onClick={() => setTimeWindow('90d')}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
              timeWindow === '90d'
                ? 'bg-background text-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('window90d', { defaultMessage: '90 Days' })}
          </button>
        </div>
      </div>

      {/* 2. Top-Level Metric Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Blended Spend */}
        <div
          data-testid="metric-spend-card"
          className="flex flex-col justify-between rounded-xl border border-border bg-background p-4 shadow-2xs transition-shadow hover:shadow-xs"
        >
          <div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">{t('metricTotalSpend', { defaultMessage: 'Total Blended Spend' })}</span>
              <DollarSign className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div
              className="mt-2 text-2xl font-extrabold text-foreground"
              dir="ltr"
              data-testid="total-spend-val"
            >
              {`$${metrics.totalSpendUsd.toLocaleString()}`}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span data-testid="meta-spend-breakdown">
                {'Meta: '}
                <span dir="ltr">{`$${metrics.metaSpendUsd.toLocaleString()}`}</span>
              </span>
              <span data-testid="google-spend-breakdown">
                {'Google: '}
                <span dir="ltr">{`$${metrics.googleSpendUsd.toLocaleString()}`}</span>
              </span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
            {isSpendPositive ? (
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
            )}
            <span>
              {`${isSpendPositive ? '+' : ''}${metrics.periodComparison.spendChangePct}% ${t('vsPrevPeriod', { defaultMessage: 'vs prev period' })}`}
            </span>
          </div>
        </div>

        {/* Card 2: Blended CAC */}
        <div
          data-testid="metric-cac-card"
          className="flex flex-col justify-between rounded-xl border border-border bg-background p-4 shadow-2xs transition-shadow hover:shadow-xs"
        >
          <div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">{t('metricBlendedCac', { defaultMessage: 'Blended CAC' })}</span>
              <Target className="h-4 w-4 text-amber-500" aria-hidden="true" />
            </div>
            <div
              className="mt-2 text-2xl font-extrabold text-foreground"
              dir="ltr"
              data-testid="blended-cac-val"
            >
              {`$${metrics.blendedCacUsd.toFixed(2)}`}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {`${metrics.totalConversions} ${t('totalConversionsLabel', { defaultMessage: 'Total Conversions' })}`}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
            {isCacReduced ? (
              <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <TrendingUp className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
            )}
            <span>
              {`${metrics.periodComparison.cacChangePct > 0 ? '+' : ''}${metrics.periodComparison.cacChangePct}% ${t('vsPrevPeriod', { defaultMessage: 'vs prev period' })}`}
            </span>
          </div>
        </div>

        {/* Card 3: Blended ROAS */}
        <div
          data-testid="metric-roas-card"
          className="flex flex-col justify-between rounded-xl border border-border bg-background p-4 shadow-2xs transition-shadow hover:shadow-xs"
        >
          <div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">{t('metricBlendedRoas', { defaultMessage: 'Blended ROAS' })}</span>
              <TrendingUp className="h-4 w-4 text-green-500" aria-hidden="true" />
            </div>
            <div
              className="mt-2 text-2xl font-extrabold text-green-600 dark:text-green-400"
              dir="ltr"
              data-testid="blended-roas-val"
            >
              {`${metrics.blendedRoas.toFixed(1)}x`}
            </div>
            <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" />
              <span>
                {`${t('conversionVelocityLabel', { defaultMessage: 'Conversion Velocity' })}: ${metrics.conversionVelocityDays} ${t('daysUnit', { defaultMessage: 'days' })}`}
              </span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
            {isRoasPositive ? (
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
            )}
            <span>
              {`${isRoasPositive ? '+' : ''}${metrics.periodComparison.roasChangePct}% ${t('vsPrevPeriod', { defaultMessage: 'vs prev period' })}`}
            </span>
          </div>
        </div>

        {/* Card 4: Revenue & Dunning Health */}
        <div
          data-testid="metric-retention-card"
          className="flex flex-col justify-between rounded-xl border border-border bg-background p-4 shadow-2xs transition-shadow hover:shadow-xs"
        >
          <div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">{t('metricRetentionHealth', { defaultMessage: 'Revenue & Dunning Health' })}</span>
              <ShieldCheck className="h-4 w-4 text-indigo-500" aria-hidden="true" />
            </div>
            <div
              className="mt-2 text-2xl font-extrabold text-green-700 dark:text-green-400"
              dir="ltr"
              data-testid="dunning-rate-val"
            >
              {`${metrics.dunningRecoveryRatePct}%`}
            </div>
            <div className="mt-2 text-xs text-muted-foreground font-medium">
              {t('dunningRecoveryLabel', { defaultMessage: 'Dunning Recovery Rate' })}
            </div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            {`${t('churnRateLabel', { defaultMessage: 'Churn Rate' })}: ${metrics.churnRatePct}%`}
          </div>
        </div>
      </div>

      {/* 3. Interactive Channel Spend Allocation Visualizer */}
      <div className="rounded-xl border border-border bg-background p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="flex items-center gap-2">
            <PieChart className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm font-bold text-foreground">
              {t('channelAllocationHeading', { defaultMessage: 'Cross-Channel Spend Allocation' })}
            </h3>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
              <span>{'Meta Ads'}</span>
              <span dir="ltr">{`(${channels[0]?.percentage ?? 50}%)`}</span>
            </span>
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
              <span>{'Google Ads'}</span>
              <span dir="ltr">{`(${channels[1]?.percentage ?? 50}%)`}</span>
            </span>
          </div>
        </div>

        {/* Visual Split Bar */}
        <div className="h-4 w-full overflow-hidden rounded-full bg-muted flex">
          <button
            type="button"
            aria-label="Filter Meta Ads Allocation"
            onClick={() => setSelectedChannel(selectedChannel === 'meta_ads' ? 'all' : 'meta_ads')}
            className={`h-full bg-gradient-to-r from-blue-600 to-blue-500 transition-all cursor-pointer hover:opacity-90 ${
              selectedChannel === 'google_ads' ? 'opacity-30' : ''
            }`}
            style={{ width: `${channels[0]?.percentage ?? 50}%` }}
          />
          <button
            type="button"
            aria-label="Filter Google Ads Allocation"
            onClick={() => setSelectedChannel(selectedChannel === 'google_ads' ? 'all' : 'google_ads')}
            className={`h-full bg-gradient-to-r from-emerald-600 to-emerald-500 transition-all cursor-pointer hover:opacity-90 ${
              selectedChannel === 'meta_ads' ? 'opacity-30' : ''
            }`}
            style={{ width: `${channels[1]?.percentage ?? 50}%` }}
          />
        </div>

        {/* Channel Breakdown Cards */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {channels.map((channel) => (
            <div
              key={channel.platform}
              className={`rounded-lg border p-4 transition-all ${
                selectedChannel === channel.platform
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border bg-card'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${channel.colorClass}`} />
                  <span className="text-xs font-bold text-foreground">{channel.label}</span>
                </div>
                <span className="text-xs font-semibold text-muted-foreground" dir="ltr">
                  {`${channel.percentage}% of total`}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-center">
                <div>
                  <span className="text-[10px] text-muted-foreground">{t('metricSpend')}</span>
                  <div className="text-xs font-bold text-foreground" dir="ltr">
                    {`$${channel.spendUsd.toLocaleString()}`}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">{t('metricRoas')}</span>
                  <div className="text-xs font-bold text-green-600 dark:text-green-400" dir="ltr">
                    {`${channel.roas}x`}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">{t('metricCac')}</span>
                  <div className="text-xs font-bold text-foreground" dir="ltr">
                    {`$${channel.cacUsd.toFixed(2)}`}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Rebalancing Headroom Callout */}
        {rebalancingRecommendation && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <Sparkles className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
              <span>{rebalancingRecommendation.rationale}</span>
            </div>
            {canExecute && onApplyRecommendation && (
              <button
                type="button"
                onClick={onApplyRecommendation}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 font-semibold text-primary-foreground hover:bg-primary/90 transition-all shrink-0 cursor-pointer"
              >
                <span>{t('rebalanceAction', { defaultMessage: '1-Click Rebalance' })}</span>
                <ArrowRight className="h-3 w-3 rtl:rotate-180" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
