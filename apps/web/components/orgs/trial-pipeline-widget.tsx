'use client';

import { useTranslations } from 'next-intl';
import { Hourglass } from 'lucide-react';
import { ChartCard } from '@/components/viz/chart-card';
import { EmptyState } from '@/components/viz/empty-state';
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
      <ChartCard title={t('heading')} icon={Hourglass} fill>
        <EmptyState icon={Hourglass} title={t(`unavailable.${view.reason}`)} compact />
      </ChartCard>
    );
  }

  const rate = view.conversionRatePct === null ? null : Math.max(0, Math.min(100, view.conversionRatePct));
  return (
    <ChartCard title={t('heading')} icon={Hourglass} fill>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          {/* Null when no bucket reported a count - unknown, which is not the same as zero open trials. */}
          <span className="text-3xl font-bold tabular-nums text-foreground">{view.activeTrials === null ? '—' : formatNumber(view.activeTrials)}</span>
          <span className="text-xs text-muted-foreground">{t('inTrialLabel')}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-3xl font-bold tabular-nums text-foreground">
            {view.conversionRatePct === null ? '—' : t('convertingValue', { ratePct: formatPercent(view.conversionRatePct) })}
          </span>
          <span className="text-xs text-muted-foreground">{t('convertingLabel')}</span>
          {rate !== null ? (
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-success" style={{ width: `${rate}%` }} />
            </div>
          ) : null}
        </div>
      </div>
    </ChartCard>
  );
}
