'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  DollarSign,
  TrendingUp,
  MousePointerClick,
  Percent,
  Target,
  Layers,
} from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import type { AdsPerformanceSummary } from '@/lib/orgs/ads-performance-synthesizer';

export interface AdsKpiScorecardsProps {
  summary: AdsPerformanceSummary;
  className?: string;
}

/**
 * Every card reads one nullable field off the summary and prints "No data" when it is null.
 *
 * This component used to paper over missing measurements with constants: `?? 14.2` for the
 * spend change, `?? 22.1` for ROAS change, `?? -12.4` for CPA change, `?? 2.85` for CTR, and
 * a `ctrDiff` of '+0.8%' or '-0.2%' chosen by comparing that made-up CTR against 2.0. The
 * result was six confident scorecards on a project that had never reported a single metric.
 *
 * The change badges are gone outright rather than defaulted: a change is a comparison against
 * a previous period, and nothing here computes one. They come back when a prior-period
 * baseline does.
 */
export function AdsKpiScorecards({ summary, className }: AdsKpiScorecardsProps): React.ReactElement {
  const t = useTranslations('Campaigns');
  const noData = t('noData');

  const activeProgress =
    summary.totalCampaignsCount > 0
      ? Math.round((summary.activeCampaignsCount / summary.totalCampaignsCount) * 100)
      : 0;

  const spendSubtext =
    summary.metaSpendUsd !== null && summary.googleSpendUsd !== null
      ? `Meta: $${summary.metaSpendUsd.toLocaleString()} · Google: $${summary.googleSpendUsd.toLocaleString()}`
      : undefined;

  return (
    <div
      data-testid="kpi-metric-cards"
      className={className ?? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'}
    >
      {/* 1. Total Spend */}
      <StatCard
        title={t('metricTotalSpend')}
        value={summary.totalSpendUsd === null ? noData : `$${summary.totalSpendUsd.toLocaleString()}`}
        icon={DollarSign}
        subtext={spendSubtext}
      />

      {/* 2. Blended ROAS */}
      <StatCard
        title={t('metricBlendedRoas')}
        value={summary.blendedRoas === null ? noData : `${summary.blendedRoas.toFixed(1)}x`}
        icon={TrendingUp}
        targetHint={summary.blendedRoas === null ? undefined : t('roasTargetHint', { target: '3.5x' })}
        progress={
          summary.blendedRoas === null
            ? undefined
            : Math.min(Math.round((summary.blendedRoas / 3.5) * 100), 100)
        }
      />

      {/* 3. Impressions & Clicks */}
      <StatCard
        title={t('metricImpressionsClicks')}
        value={
          summary.totalImpressions === null
            ? noData
            : summary.totalImpressions >= 1000
              ? `${(summary.totalImpressions / 1000).toFixed(1)}k`
              : String(summary.totalImpressions)
        }
        icon={MousePointerClick}
        subtext={
          summary.totalClicks === null || summary.totalConversions === null
            ? undefined
            : `${t('clicksCount', { count: summary.totalClicks.toLocaleString() })} · ${t('conversionsCountShort', { count: summary.totalConversions })}`
        }
      />

      {/* 4. Average CTR */}
      <StatCard
        title={t('metricAvgCtr')}
        value={summary.blendedCtrPct === null ? noData : `${summary.blendedCtrPct}%`}
        icon={Percent}
      />

      {/* 5. Blended CPA */}
      <StatCard
        title={t('metricBlendedCpa')}
        value={summary.blendedCpaUsd === null ? noData : `$${summary.blendedCpaUsd.toFixed(2)}`}
        icon={Target}
        subtext={
          summary.totalConversions === null ? undefined : `${summary.totalConversions} total conv.`
        }
      />

      {/* 6. Active Campaigns */}
      <StatCard
        title={t('metricActiveCampaigns')}
        value={`${summary.activeCampaignsCount} / ${summary.totalCampaignsCount}`}
        icon={Layers}
        progress={activeProgress}
        targetHint={t('liveDeliveryCount', { count: summary.activeCampaignsCount })}
        subtext={`${activeProgress}% active`}
      />
    </div>
  );
}
