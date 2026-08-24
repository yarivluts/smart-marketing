'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Layers, Trophy, TrendingUp } from 'lucide-react';
import type { ChannelPerformance } from './types';

export interface ChannelRoiCardProps {
  channels: ChannelPerformance[];
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(val);
}

function formatNum(val: number): string {
  return new Intl.NumberFormat(undefined).format(val);
}

export function ChannelRoiCard({ channels }: ChannelRoiCardProps): React.ReactElement {
  const t = useTranslations('GrowthDashboard');

  const totalRev = channels.reduce((sum, c) => sum + c.revenue, 0);

  return (
    <Card className="flex flex-col gap-5 p-6 bg-card border-border shadow-sm">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
              <Layers className="h-4 w-4" aria-hidden="true" />
            </div>
            <h3 className="text-base font-bold text-foreground">{t('channelRoiTitle')}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('channelRoiSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1 text-xs font-semibold text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
          <span>{t('crossChannelOptimized')}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {channels.map((ch) => {
          const share = totalRev > 0 ? Math.round((ch.revenue / totalRev) * 100) : 0;
          return (
            <div
              key={ch.channelId}
              className={`relative flex flex-col justify-between rounded-2xl border p-4 transition-all ${
                ch.isTopRoas
                  ? 'border-emerald-500/50 bg-emerald-500/[0.03] dark:bg-emerald-500/[0.06] shadow-sm'
                  : 'border-border bg-background'
              }`}
            >
              {ch.isTopRoas ? (
                <div className="absolute -top-2.5 end-3 flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
                  <Trophy className="h-3 w-3" aria-hidden="true" />
                  {t('topRoasBadge')}
                </div>
              ) : null}

              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">{t(ch.nameKey)}</span>
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {`${share}% ${t('shareOfRevenue')}`}
                </span>
              </div>

              <div className="my-4 flex items-baseline justify-between border-y border-border/60 py-3">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">{t('metricRoas')}</span>
                  <span className="text-2xl font-black text-foreground">{`${ch.roas}x`}</span>
                </div>
                <div className="flex flex-col text-end">
                  <span className="text-xs text-muted-foreground">{t('metricCpa')}</span>
                  <span className="text-sm font-bold text-foreground">{formatCurrency(ch.cpa)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('metricSpend')}</span>
                  <span className="font-semibold text-foreground">{formatCurrency(ch.spend)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('metricRevenue')}</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(ch.revenue)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('metricConversions')}</span>
                  <span className="font-semibold text-foreground">{formatNum(ch.conversions)}</span>
                </div>

                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${
                      ch.channelId === 'google_ads'
                        ? 'bg-blue-500'
                        : ch.channelId === 'meta_ads'
                          ? 'bg-indigo-600'
                          : 'bg-rose-500'
                    }`}
                    style={{ width: `${share}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
