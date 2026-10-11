'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
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
  buildExecutiveReportData,
} from '@/lib/orgs/executive-reporting-synthesizer';
import type { AutomationTargetView } from '@/lib/orgs/automation-view';
import type { CampaignSpendBreakdownOutcome } from '@/lib/orgs/queries';

export interface ExecutiveBlendedReportProps {
  metrics?: ExecutiveBlendedMetrics;
  initialMetrics?: ExecutiveBlendedMetrics;
  targets?: AutomationTargetView[];
  spendOutcome?: CampaignSpendBreakdownOutcome | null;
  canExecute?: boolean;
  onApplyRecommendation?: () => void;
  className?: string;
}

export function ExecutiveBlendedReport({
  metrics: externalMetrics,
  initialMetrics,
  targets = [],
  spendOutcome = null,
  canExecute = false,
  onApplyRecommendation,
  className = '',
}: ExecutiveBlendedReportProps): React.ReactElement {
  const t = useTranslations('ExecutiveReport');

  const [selectedChannel, setSelectedChannel] = useState<'all' | 'meta_ads' | 'google_ads'>('all');

  /*
    The window is fixed at 30 days because that is the only window the spend query measures
    (CAMPAIGN_SPEND_TRAILING_WINDOW_DAYS). This used to offer 7 / 30 / 90 day pills that changed
    nothing but their own highlight, so choosing "7 Days" relabelled 30-day spend as 7-day spend.
  */
  const reportData = useMemo(() => {
    if (externalMetrics) {
      return buildExecutiveReportData({ overrides: externalMetrics, timeWindow: '30d' });
    }
    return buildExecutiveReportData({
      targets,
      spendOutcome,
      timeWindow: '30d',
      overrides: initialMetrics,
    });
  }, [externalMetrics, initialMetrics, targets, spendOutcome]);

  const { metrics, channels, rebalancingRecommendation } = reportData;

  /*
    Every figure below is nullable, and null means GrowthOS has not measured it. These
    helpers are the only way a value reaches the screen, so a missing measurement renders as
    "No data" rather than as a confident number. The previous version could not express
    absence at all: the builder manufactured spend from the daily budget, revenue from a
    fixed ROAS multiplier, and churn/dunning/velocity from constants, and this component
    printed them under a green "Live Blended Pipeline" badge.
  */
  const noData = t('noData', { defaultMessage: 'No data' });
  const usd = (v: number | null): string => (v === null ? noData : `$${v.toLocaleString()}`);
  const usd2 = (v: number | null): string => (v === null ? noData : `$${v.toFixed(2)}`);
  const times = (v: number | null, digits = 1): string => (v === null ? noData : `${v.toFixed(digits)}x`);
  const pct = (v: number | null): string => (v === null ? noData : `${v}%`);
  const plain = (v: number | null): string => (v === null ? noData : String(v));

  // Absent until a prior-period baseline exists; the chips are withheld rather than defaulted.
  const comparison = metrics.periodComparison;
  const isSpendPositive = (comparison?.spendChangePct ?? 0) >= 0;
  const isCacReduced = (comparison?.cacChangePct ?? 0) <= 0; // A CAC decrease is an improvement
  const isRoasPositive = (comparison?.roasChangePct ?? 0) >= 0;

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
            {/* "Live" only when something was actually measured - never on an empty report. */}
            {metrics.totalSpendUsd !== null ? (
              <span
                data-testid="zero-config-badge"
                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {t('liveBadge', { defaultMessage: 'Live Blended Pipeline' })}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            {t('subtitle', {
              defaultMessage: 'Zero-configuration blended analytics across Meta & Google Ads',
            })}
          </p>
        </div>

        <span
          data-testid="report-window-label"
          className="rounded-xl border border-border bg-muted/50 px-3 py-1.5 text-xs font-semibold text-foreground"
        >
          {t('timeRange30d')}
        </span>
      </div>

      {/* 2. Top Blended Scorecards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Blended Spend */}
        <div
          data-testid="metric-spend-card"
          className="flex flex-col justify-between rounded-2xl border border-border bg-background p-5 shadow-2xs transition-all hover:shadow-xs"
        >
          <div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold">
                {t('metricTotalSpend', { defaultMessage: 'Total Blended Spend' })}
              </span>
              <DollarSign className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div
              className="mt-2 text-2xl font-extrabold tracking-tight text-foreground"
              dir="ltr"
              data-testid="total-spend-val"
            >
              {usd(metrics.totalSpendUsd)}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span data-testid="meta-spend-breakdown">
                {'Meta: '}
                <span dir="ltr">{usd(metrics.metaSpendUsd)}</span>
              </span>
              <span data-testid="google-spend-breakdown">
                {'Google: '}
                <span dir="ltr">{usd(metrics.googleSpendUsd)}</span>
              </span>
            </div>
          </div>
          {comparison ? (
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {isSpendPositive ? (
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />
              )}
              <span>
                {`${isSpendPositive ? '+' : ''}${comparison.spendChangePct}% ${t('vsPrevPeriod', { defaultMessage: 'vs prev period' })}`}
              </span>
            </div>
          ) : null}
        </div>

        {/* Card 2: Blended CAC */}
        <div
          data-testid="metric-cac-card"
          className="flex flex-col justify-between rounded-2xl border border-border bg-background p-5 shadow-2xs transition-all hover:shadow-xs"
        >
          <div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold">
                {t('metricBlendedCac', { defaultMessage: 'Blended CAC' })}
              </span>
              <Target className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div
              className="mt-2 text-2xl font-extrabold tracking-tight text-foreground"
              dir="ltr"
              data-testid="blended-cac-val"
            >
              {usd2(metrics.blendedCacUsd)}
            </div>
            <div className="mt-2 text-xs text-muted-foreground font-medium">
              {`${plain(metrics.totalConversions)} ${t('totalConversionsLabel', { defaultMessage: 'Total Conversions' })}`}
            </div>
          </div>
          {comparison ? (
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {isCacReduced ? (
                <TrendingDown className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              ) : (
                <TrendingUp className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />
              )}
              <span>
                {`${comparison.cacChangePct}% ${t('vsPrevPeriod', { defaultMessage: 'vs prev period' })}`}
              </span>
            </div>
          ) : null}
        </div>

        {/* Card 3: Blended ROAS */}
        <div
          data-testid="metric-roas-card"
          className="flex flex-col justify-between rounded-2xl border border-border bg-background p-5 shadow-2xs transition-all hover:shadow-xs"
        >
          <div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold">
                {t('metricBlendedRoas', { defaultMessage: 'Blended ROAS' })}
              </span>
              <TrendingUp className="h-4 w-4 text-emerald-500" aria-hidden="true" />
            </div>
            <div
              className="mt-2 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400"
              dir="ltr"
              data-testid="blended-roas-val"
            >
              {times(metrics.blendedRoas)}
            </div>
            <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" />
              <span>
                {`${t('conversionVelocityLabel', { defaultMessage: 'Conversion Velocity' })}: ${plain(metrics.conversionVelocityDays)} ${t('daysUnit', { defaultMessage: 'days' })}`}
              </span>
            </div>
          </div>
          {comparison ? (
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {isRoasPositive ? (
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />
              )}
              <span>
                {`${isRoasPositive ? '+' : ''}${comparison.roasChangePct}% ${t('vsPrevPeriod', { defaultMessage: 'vs prev period' })}`}
              </span>
            </div>
          ) : null}
        </div>

        {/* Card 4: Revenue & Dunning Health */}
        <div
          data-testid="metric-retention-card"
          className="flex flex-col justify-between rounded-2xl border border-border bg-background p-5 shadow-2xs transition-all hover:shadow-xs"
        >
          <div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold">
                {t('metricRetentionHealth', { defaultMessage: 'Revenue & Dunning Health' })}
              </span>
              <ShieldCheck className="h-4 w-4 text-indigo-500" aria-hidden="true" />
            </div>
            <div
              className="mt-2 text-2xl font-extrabold text-emerald-700 dark:text-emerald-400"
              dir="ltr"
              data-testid="dunning-rate-val"
            >
              {pct(metrics.dunningRecoveryRatePct)}
            </div>
            <div className="mt-2 text-xs text-muted-foreground font-medium">
              {t('dunningRecoveryLabel', { defaultMessage: 'Dunning Recovery Rate' })}
            </div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            {`${t('churnRateLabel', { defaultMessage: 'Churn Rate' })}: ${pct(metrics.churnRatePct)}`}
          </div>
        </div>
      </div>

      {/* 3. Interactive Channel Spend Allocation Visualizer */}
      <div className="rounded-2xl border border-border bg-background p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="flex items-center gap-2">
            <PieChart className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm font-bold text-foreground">
              {t('channelAllocationHeading', { defaultMessage: 'Cross-Channel Spend Allocation' })}
            </h3>
          </div>
          {channels.length > 0 ? (
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                <span>{'Meta Ads'}</span>
                <span dir="ltr">{`(${channels[0].percentage}%)`}</span>
              </span>
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                <span>{'Google Ads'}</span>
                <span dir="ltr">{`(${channels[1].percentage}%)`}</span>
              </span>
            </div>
          ) : null}
        </div>

        {/*
          With no measured spend there is no split. This used to fall back to `?? 50` on both
          halves, drawing a confident 50/50 Meta/Google allocation for a project with no spend.
        */}
        {channels.length === 0 ? (
          <p
            data-testid="channel-allocation-empty"
            className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground"
          >
            {t('channelAllocationEmpty')}
          </p>
        ) : (
          <div className="h-4 w-full overflow-hidden rounded-full bg-muted flex" data-testid="channel-split-bar">
            <button
              type="button"
              aria-label="Filter Meta Ads Allocation"
              onClick={() => setSelectedChannel(selectedChannel === 'meta_ads' ? 'all' : 'meta_ads')}
              className={`h-full bg-gradient-to-r from-blue-600 to-blue-500 transition-all cursor-pointer hover:opacity-90 ${
                selectedChannel === 'google_ads' ? 'opacity-30' : ''
              }`}
              style={{ width: `${channels[0].percentage}%` }}
            />
            <button
              type="button"
              aria-label="Filter Google Ads Allocation"
              onClick={() => setSelectedChannel(selectedChannel === 'google_ads' ? 'all' : 'google_ads')}
              className={`h-full bg-gradient-to-r from-emerald-600 to-emerald-500 transition-all cursor-pointer hover:opacity-90 ${
                selectedChannel === 'meta_ads' ? 'opacity-30' : ''
              }`}
              style={{ width: `${channels[1].percentage}%` }}
            />
          </div>
        )}

        {/* Channel Breakdown Cards */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {channels.map((channel) => (
            <div
              key={channel.platform}
              className={`rounded-xl border p-4 transition-all ${
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
                  <span className="text-[10px] text-muted-foreground">{t('metricSpend', { defaultMessage: 'Spend' })}</span>
                  <div className="text-xs font-bold text-foreground" dir="ltr">
                    {`$${channel.spendUsd.toLocaleString()}`}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">{t('metricRoas', { defaultMessage: 'ROAS' })}</span>
                  <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400" dir="ltr">
                    {channel.roas === null ? noData : `${channel.roas}x`}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">{t('metricCac', { defaultMessage: 'CAC' })}</span>
                  <div className="text-xs font-bold text-foreground" dir="ltr">
                    {usd2(channel.cacUsd)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Rebalancing Headroom Callout */}
        {rebalancingRecommendation ? (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs">
            <div className="flex items-center gap-2.5 text-foreground font-medium">
              <Sparkles className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
              <span>{rebalancingRecommendation.rationale}</span>
            </div>
            {canExecute && onApplyRecommendation ? (
              <button
                type="button"
                onClick={onApplyRecommendation}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 font-semibold text-primary-foreground hover:bg-primary/90 transition-all shrink-0 cursor-pointer shadow-xs"
              >
                <span>{t('rebalanceAction', { defaultMessage: '1-Click Rebalance' })}</span>
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
