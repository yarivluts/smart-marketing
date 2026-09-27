'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BarChart3, CalendarClock, Gauge, Layers, PieChart, PlugZap, Radio, Wallet } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { StatCard } from '@/components/ui/stat-card';
import { BarList, ChartCard, DonutChart, EmptyState, TrendChart, formatVizValue } from '@/components/viz';
import type { UnifiedCampaignItem } from '@/lib/orgs/ads-performance-synthesizer';
import type { CampaignSpendBreakdownOutcome } from '@/lib/orgs/queries';
import { buildAdsChannelBreakdown, buildAdsEfficiency, liveDailyBudgetUsd, spendByCampaign } from '@/lib/orgs/ads-performance-charts';

export interface AdsPerformanceChartsProps {
  orgId: string;
  projectId: string;
  items: readonly UnifiedCampaignItem[];
  spendOutcome: CampaignSpendBreakdownOutcome | null;
  /** The trailing window the spend figures cover, in days. */
  spendWindowDays: number;
}

const USD = { currency: 'USD' } as const;

/**
 * The cockpit's visual layer: spend per channel and per campaign plus efficiency figures when the
 * warehouse has measured spend, and an explicit "connect a source" state when it has not. The
 * channel mix and budget charts below come from the campaign rows themselves (their platform,
 * status and configured budget), so they are real even before any spend is measured.
 */
export function AdsPerformanceCharts({ orgId, projectId, items, spendOutcome, spendWindowDays }: AdsPerformanceChartsProps): React.ReactElement | null {
  const t = useTranslations('Campaigns');
  const locale = useLocale();
  if (items.length === 0) {
    return null;
  }
  const money = (value: number) => formatVizValue(value, USD, locale);
  const channels = buildAdsChannelBreakdown(items);
  const efficiency = buildAdsEfficiency(items, spendWindowDays);
  const campaignSpend = spendByCampaign(items);
  const measuredChannels = channels.filter((channel): channel is typeof channel & { spendUsd: number } => channel.spendUsd !== null && channel.spendUsd > 0);
  const measuredCount = items.filter((item) => item.spend30dUsd !== null).length;
  const platformLabel = (platform: string) => t(`platform.${platform}`);

  const emptyDescription =
    spendOutcome && !spendOutcome.ok ? t(`spendCockpitDegraded.${spendOutcome.reason}`) : t('spendEmptyNoRows', { days: spendWindowDays });

  return (
    <div className="flex flex-col gap-6" data-testid="ads-performance-charts">
      {efficiency ? (
        <>
          <div className="grid gap-6 lg:grid-cols-5">
            <ChartCard title={t('chartsSpendByChannel')} description={t('chartsSpendWindow', { days: spendWindowDays })} icon={PieChart} className="lg:col-span-2" fill>
              {measuredChannels.length > 0 ? (
                <DonutChart
                  label={t('chartsSpendByChannel')}
                  data={measuredChannels.map((channel) => ({ label: platformLabel(channel.platform), value: channel.spendUsd }))}
                  centerValue={money(efficiency.totalSpendUsd)}
                  centerLabel={t('chartsSpendCenterLabel')}
                  valueFormat={USD}
                  layout="stacked"
                  size={170}
                />
              ) : (
                <EmptyState compact icon={PieChart} title={t('chartsNoPositiveSpend')} />
              )}
            </ChartCard>
            <ChartCard title={t('chartsSpendByCampaign')} description={t('chartsSpendWindow', { days: spendWindowDays })} icon={BarChart3} className="lg:col-span-3" fill>
              {campaignSpend.length > 0 ? (
                <BarList
                  items={campaignSpend.map((row) => ({
                    key: row.targetId,
                    label: row.label,
                    sublabel: platformLabel(row.platform),
                    value: row.spendUsd,
                    href: `/orgs/${orgId}/projects/${projectId}/campaigns/${encodeURIComponent(row.targetId)}`,
                  }))}
                  valueFormatter={money}
                  maxItems={8}
                  moreLabel={(hidden) => t('chartsMoreCampaigns', { count: hidden })}
                />
              ) : (
                <EmptyState compact icon={BarChart3} title={t('chartsNoPositiveSpend')} />
              )}
            </ChartCard>
          </div>

          <ChartCard title={t('chartsEfficiencyTitle')} description={t('chartsEfficiencyDescription')} icon={Gauge}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard title={t('effAvgDailySpend')} value={money(efficiency.avgDailySpendUsd)} icon={CalendarClock} />
              <StatCard
                title={t('effBudgetUtilization')}
                value={efficiency.budgetUtilizationPct === null ? t('noData') : formatVizValue(efficiency.budgetUtilizationPct, 'percent', locale)}
                icon={Gauge}
                progress={efficiency.budgetUtilizationPct === null ? undefined : Math.min(100, Math.round(efficiency.budgetUtilizationPct))}
                subtext={t('effBudgetUtilizationHint', { days: spendWindowDays })}
              />
              <StatCard
                title={t('effMeasuredCoverage')}
                value={formatVizValue(efficiency.measuredCoveragePct, 'percent', locale)}
                icon={Layers}
                progress={efficiency.measuredCoveragePct}
                subtext={t('effMeasuredCoverageSub', { measured: measuredCount, total: items.length })}
              />
              <StatCard title={t('effLiveBudget')} value={money(liveDailyBudgetUsd(items))} icon={Radio} subtext={t('effLiveBudgetSub')} />
            </div>
          </ChartCard>
        </>
      ) : (
        <EmptyState
          icon={PlugZap}
          title={t('spendEmptyTitle')}
          description={emptyDescription}
          action={
            <Link
              href={`/orgs/${orgId}/projects/${projectId}/plugins`}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <PlugZap className="h-4 w-4" aria-hidden="true" />
              {t('connectAdSourceCta')}
            </Link>
          }
        />
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <ChartCard title={t('chartsCampaignsByChannel')} description={t('chartsCampaignsByChannelDescription', { count: items.length })} icon={Layers} className="lg:col-span-2" fill>
          <DonutChart
            label={t('chartsCampaignsByChannel')}
            data={channels.map((channel) => ({ label: platformLabel(channel.platform), value: channel.campaigns }))}
            centerValue={formatVizValue(items.length, 'number', locale)}
            centerLabel={t('chartsCampaignsCenterLabel')}
            layout="stacked"
            size={170}
          />
        </ChartCard>
        <ChartCard title={t('chartsBudgetByChannel')} description={t('chartsBudgetByChannelDescription')} icon={Wallet} className="lg:col-span-3" fill>
          <TrendChart
            label={t('chartsBudgetByChannel')}
            kind="bar"
            stacked
            xKey="channel"
            valueFormat={USD}
            height={240}
            data={channels.map((channel) => ({
              channel: platformLabel(channel.platform),
              active: channel.activeDailyBudgetUsd,
              paused: channel.inactiveDailyBudgetUsd,
            }))}
            series={[
              { key: 'active', label: t('seriesActiveBudget'), color: 'hsl(var(--success))' },
              { key: 'paused', label: t('seriesPausedBudget'), color: 'hsl(var(--muted-foreground) / 0.45)' },
            ]}
            showLegend
          />
        </ChartCard>
      </div>
    </div>
  );
}
