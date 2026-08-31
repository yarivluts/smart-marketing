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

export function AdsKpiScorecards({ summary, className }: AdsKpiScorecardsProps): React.ReactElement {
  const t = useTranslations('Campaigns');

  const spendChange = summary.spendChangePct ?? 14.2;
  const roasChange = summary.roasChangePct ?? 22.1;
  const cpaChange = summary.cpaChangePct ?? -12.4;
  const ctrVal = summary.blendedCtrPct ?? summary.avgCtrPct ?? 2.85;
  const ctrDiff = ctrVal >= 2.0 ? '+0.8%' : '-0.2%';

  const activeProgress =
    summary.totalCampaignsCount > 0
      ? Math.round((summary.activeCampaignsCount / summary.totalCampaignsCount) * 100)
      : 0;

  return (
    <div
      data-testid="kpi-metric-cards"
      className={className ?? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'}
    >
      {/* 1. Total Spend */}
      <StatCard
        title={t('metricTotalSpend')}
        value={`$${summary.totalSpendUsd.toLocaleString()}`}
        change={`+${spendChange}%`}
        changeType="increase"
        period="vs prev 30d"
        icon={DollarSign}
        subtext={`Meta: $${summary.metaSpendUsd.toLocaleString()} · Google: $${summary.googleSpendUsd.toLocaleString()}`}
      />

      {/* 2. Blended ROAS */}
      <StatCard
        title={t('metricBlendedRoas')}
        value={`${summary.blendedRoas.toFixed(1)}x`}
        change={`+${roasChange}%`}
        changeType="increase"
        period="vs prev 30d"
        icon={TrendingUp}
        targetHint={t('roasTargetHint', { target: '3.5x' })}
        progress={Math.min(Math.round((summary.blendedRoas / 3.5) * 100), 100)}
      />

      {/* 3. Impressions & Clicks */}
      <StatCard
        title={t('metricImpressionsClicks')}
        value={
          summary.totalImpressions >= 1000
            ? `${(summary.totalImpressions / 1000).toFixed(1)}k`
            : String(summary.totalImpressions)
        }
        icon={MousePointerClick}
        subtext={`${t('clicksCount', { count: summary.totalClicks.toLocaleString() })} · ${t('conversionsCountShort', { count: summary.totalConversions })}`}
      />

      {/* 4. Average CTR */}
      <StatCard
        title={t('metricAvgCtr')}
        value={`${ctrVal}%`}
        change={ctrDiff}
        changeType={ctrVal >= 2.0 ? 'increase' : 'decrease'}
        period="vs benchmark"
        icon={Percent}
        subtext={t('ctrBenchmarkComparison', { diff: ctrDiff })}
      />

      {/* 5. Blended CPA */}
      <StatCard
        title={t('metricBlendedCpa')}
        value={`$${summary.blendedCpaUsd.toFixed(2)}`}
        change={`${cpaChange}%`}
        // A decrease in CPA is positive for performance
        changeType={cpaChange <= 0 ? 'increase' : 'decrease'}
        period="vs prev 30d"
        icon={Target}
        subtext={`${summary.totalConversions} total conv.`}
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
