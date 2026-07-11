'use client';

import { useTranslations } from 'next-intl';
import type { TrialPipelineWidgetView } from '@/lib/orgs/trial-pipeline-view';

export interface TrialPipelineWidgetProps {
  view: TrialPipelineWidgetView;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

/**
 * KAN-66's trial-pipeline war-room widget (E12.2b, `14` gap 14: "in trial
 * now -> converting at X%") — a small headline card on the win-rules
 * ("war-room") page, next to the live win feed. Degrades to a translated
 * empty state instead of a blank/broken tile when the SaaS pack isn't
 * installed, the warehouse isn't configured yet, or the project's daily
 * query quota is spent — the same per-widget degrade posture board tiles
 * already established (`BoardTileQueryOutcome`).
 */
export function TrialPipelineWidget({ view }: TrialPipelineWidgetProps): React.ReactElement {
  const t = useTranslations('TrialPipeline');

  if (view.status === 'unavailable') {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-input px-4 py-3">
        <h2 className="text-lg font-semibold">{t('heading')}</h2>
        <p className="text-sm text-muted-foreground">{t(`unavailable.${view.reason}`)}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-input px-4 py-3">
      <h2 className="text-lg font-semibold">{t('heading')}</h2>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div className="flex flex-col">
          <span className="text-2xl font-bold tabular-nums">{formatNumber(view.activeTrials)}</span>
          <span className="text-xs text-muted-foreground">{t('inTrialLabel')}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-2xl font-bold tabular-nums">
            {view.conversionRatePct === null ? '—' : t('convertingValue', { ratePct: formatPercent(view.conversionRatePct) })}
          </span>
          <span className="text-xs text-muted-foreground">{t('convertingLabel')}</span>
        </div>
      </div>
    </section>
  );
}
