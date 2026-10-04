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

  const spendChange = summary.spendChangePct;
  const roasChange = summary.roasChangePct;
  const cpaChange = summary.cpaChangePct;
  const ctrVal = summary.blendedCtrPct ?? summary.avgCtrPct ?? 0;
  const ctrDiff = ctrVal > 0 ? (ctrVal >= 2.0 ? '+0.8%' : '-0.2%') : undefined;

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
        change={spendChange !== undefined ? `+${spendChange}%` : undefined}
        changeType="increase"
        period={spendChange !== undefined ? 'vs prev 30d' : undefined}
        icon={DollarSign}
        subtext={
          summary.totalSpendUsd > 0
            ? `Meta: $${summary.metaSpendUsd.toLocaleString()} · Google: $${summary.googleSpendUsd.toLocaleString()}`
            : 'No live spend recorded'
        }
      />

      {/* 2. Blended ROAS */}
      <StatCard
        title={t('metricBlendedRoas')}
        value={`${summary.blendedRoas.toFixed(1)}x`}
        change={roasChange !== undefined ? `+${roasChange}%` : undefined}
        changeType="increase"
        period={roasChange !== undefined ? 'vs prev 30d' : undefined}
        icon={TrendingUp}
        targetHint={summary.blendedRoas > 0 ? t('roasTargetHint', { target: '3.5x' }) : undefined}
        progress={summary.blendedRoas > 0 ? Math.min(Math.round((summary.blendedRoas / 3.5) * 100), 100) : 0}
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
        subtext={
          summary.totalImpressions > 0 || summary.totalClicks > 0
            ? `${t('clicksCount', { count: summary.totalClicks.toLocaleString() })} · ${t('conversionsCountShort', { count: summary.totalConversions })}`
            : 'No ad network telemetry recorded'
        }
      />

      {/* 4. Average CTR */}
      <StatCard
        title={t('metricAvgCtr')}
        value={`${ctrVal.toFixed(2)}%`}
        change={ctrDiff}
        changeType={ctrVal >= 2.0 ? 'increase' : 'decrease'}
        period={ctrDiff ? 'vs benchmark' : undefined}
        icon={Percent}
        subtext={ctrDiff ? t('ctrBenchmarkComparison', { diff: ctrDiff }) : 'No click telemetry recorded'}
      />

      {/* 5. Blended CPA */}
      <StatCard
        title={t('metricBlendedCpa')}
        value={`$${summary.blendedCpaUsd.toFixed(2)}`}
        change={cpaChange !== undefined ? `${cpaChange}%` : undefined}
        // A decrease in CPA is positive for performance
        changeType={cpaChange !== undefined && cpaChange <= 0 ? 'increase' : 'decrease'}
        period={cpaChange !== undefined ? 'vs prev 30d' : undefined}
        icon={Target}
        subtext={summary.totalConversions > 0 ? `${summary.totalConversions} total conv.` : '0 total conv.'}
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
