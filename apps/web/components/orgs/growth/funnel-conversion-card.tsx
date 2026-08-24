'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Filter, Activity } from 'lucide-react';
import type { FunnelStepItem } from './types';

export interface FunnelConversionCardProps {
  steps: FunnelStepItem[];
}

function formatNum(val: number): string {
  return new Intl.NumberFormat(undefined).format(val);
}

export function FunnelConversionCard({ steps }: FunnelConversionCardProps): React.ReactElement {
  const t = useTranslations('GrowthDashboard');

  const maxCount = steps[0]?.count ?? 1;

  return (
    <Card className="flex flex-col gap-6 p-6 bg-card border-border shadow-sm">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-blue-500/10 p-1.5 text-blue-600 dark:text-blue-400">
              <Filter className="h-4 w-4" aria-hidden="true" />
            </div>
            <h3 className="text-base font-bold text-foreground">{t('funnelTitle')}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('funnelSubtitle')}</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Activity className="h-3.5 w-3.5 text-blue-500" />
          <span>{t('endToEndTrackingActive')}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        {steps.map((step, idx) => {
          const widthPct = Math.max(15, Math.round((step.count / maxCount) * 100));
          return (
            <div
              key={step.key}
              className="relative flex flex-col justify-between rounded-2xl border border-border/80 bg-background p-4 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-muted-foreground">
                  {`${idx + 1}. ${t(step.titleKey)}`}
                </span>
                {step.dropoffPct ? (
                  <span className="text-[10px] font-semibold text-rose-500" title={t('dropoffTitle')}>
                    {`-${step.dropoffPct.toFixed(0)}%`}
                  </span>
                ) : null}
              </div>

              <div className="my-3 flex flex-col">
                <span className="text-lg font-black tracking-tight text-foreground">{formatNum(step.count)}</span>
                {step.conversionFromPrevPct ? (
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {`${step.conversionFromPrevPct.toFixed(1)}% ${t('conversionFromPrev')}`}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">{t('topOfFunnel')}</span>
                )}
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
