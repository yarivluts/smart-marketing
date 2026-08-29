'use client';

import { useTranslations } from 'next-intl';

/** Plain serializable mirror of `CampaignSpendOutcome` (`lib/orgs/queries.ts`) — same client-boundary reasoning as `CampaignDraftView`. */
export type CampaignSpendView =
  | { ok: true; totalSpendUsd: number; days: { date: string; spendUsd: number }[] }
  | { ok: false; reason: 'warehouse_not_configured' | 'metric_not_registered' | 'not_yet_backed' | 'quota_exceeded' | 'query_error' };

export interface CampaignSpendPanelProps {
  spend: CampaignSpendView;
}

/**
 * The campaign's warehouse-backed ad spend over the last 28 days — the same
 * per-tile graceful-degradation posture as `BoardTileView`: a degraded
 * outcome renders an honest "why not" line, and an empty-but-ok outcome
 * renders "no spend recorded" (the truth for a campaign that never served)
 * rather than fabricating zeros into a chart.
 */
export function CampaignSpendPanel({ spend }: CampaignSpendPanelProps): React.ReactElement {
  const t = useTranslations('Campaigns');

  if (!spend.ok) {
    return <p className="text-sm text-muted-foreground">{t(`spendDegraded.${spend.reason}`)}</p>;
  }

  if (spend.days.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('spendNoData')}</p>;
  }

  const maxSpend = Math.max(...spend.days.map((day) => day.spendUsd), 0);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-input p-4 text-sm">
      <span>
        <span className="text-muted-foreground">{t('spendTotalLabel')}{': '}</span>
        <span className="font-medium" dir="ltr">
          {t('spendAmount', { amount: spend.totalSpendUsd.toFixed(2) })}
        </span>
      </span>
      <div className="flex items-end gap-0.5" dir="ltr" aria-label={t('spendChartLabel')}>
        {spend.days.map((day) => (
          <div
            key={day.date}
            title={`${day.date}: $${day.spendUsd.toFixed(2)}`}
            className="w-2 rounded-t bg-primary/60"
            style={{ height: `${maxSpend > 0 ? Math.max(4, Math.round((day.spendUsd / maxSpend) * 64)) : 4}px` }}
          />
        ))}
      </div>
    </div>
  );
}
