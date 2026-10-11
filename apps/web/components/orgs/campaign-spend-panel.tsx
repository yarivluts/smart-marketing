'use client';

import { useLocale, useTranslations } from 'next-intl';
import { CircleDollarSign, DatabaseZap } from 'lucide-react';
import { EmptyState, TrendChart, formatVizValue } from '@/components/viz';
import { summariseSpendDays } from '@/lib/orgs/campaign-detail-view';

/** Plain serializable mirror of `CampaignSpendOutcome` (`lib/orgs/queries.ts`) — same client-boundary reasoning as `CampaignDraftView`. */
export type CampaignSpendView =
  | { ok: true; totalSpendUsd: number; days: { date: string; spendUsd: number }[] }
  | { ok: false; reason: 'warehouse_not_configured' | 'metric_not_registered' | 'not_yet_backed' | 'quota_exceeded' | 'query_error' };

export interface CampaignSpendPanelProps {
  spend: CampaignSpendView;
}

const USD = { currency: 'USD' } as const;

/**
 * The campaign's warehouse-backed ad spend over the last 28 days as a daily trend — the same
 * per-tile graceful-degradation posture as `BoardTileView`: a degraded outcome renders an honest
 * "why not" state, and an empty-but-ok outcome renders "no spend recorded" (the truth for a
 * campaign that never served) rather than fabricating zeros into a chart.
 */
export function CampaignSpendPanel({ spend }: CampaignSpendPanelProps): React.ReactElement {
  const t = useTranslations('Campaigns');
  const locale = useLocale();

  if (!spend.ok) {
    return <EmptyState compact icon={DatabaseZap} title={t('spendUnavailableTitle')} description={t(`spendDegraded.${spend.reason}`)} />;
  }

  const summary = summariseSpendDays(spend.days);
  if (!summary) {
    return <EmptyState compact icon={CircleDollarSign} title={t('spendNoData')} />;
  }

  const dayLabel = (date: string): string => {
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(parsed);
  };
  const money = (value: number) => formatVizValue(value, USD, locale);

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-xl bg-muted/40 px-3 py-2">
          <dt className="text-xs text-muted-foreground">{t('spendTotalLabel')}</dt>
          <dd className="text-lg font-semibold tabular-nums" dir="ltr">
            {t('spendAmount', { amount: spend.totalSpendUsd.toFixed(2) })}
          </dd>
        </div>
        <div className="rounded-xl bg-muted/40 px-3 py-2">
          <dt className="text-xs text-muted-foreground">{t('spendAvgDailyLabel')}</dt>
          <dd className="text-lg font-semibold tabular-nums" dir="ltr">
            {money(summary.avgDailyUsd)}
          </dd>
        </div>
        <div className="rounded-xl bg-muted/40 px-3 py-2">
          <dt className="text-xs text-muted-foreground">{t('spendPeakDayLabel')}</dt>
          <dd className="text-lg font-semibold tabular-nums" dir="ltr">
            {money(summary.peak.spendUsd)}
          </dd>
          <dd className="text-xs text-muted-foreground">{dayLabel(summary.peak.date)}</dd>
        </div>
      </dl>
      <TrendChart
        label={t('spendChartLabel')}
        xKey="day"
        kind="area"
        valueFormat={USD}
        height={220}
        data={spend.days.map((day) => ({ day: dayLabel(day.date), spend: day.spendUsd }))}
        series={[{ key: 'spend', label: t('spendChartLabel') }]}
      />
    </div>
  );
}
