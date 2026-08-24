'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Sparkles, Video, Image, FileText, LayoutGrid, Award, MousePointerClick } from 'lucide-react';
import type { CreativePerformanceItem } from './types';

export interface CreativePerformanceCardProps {
  creatives: CreativePerformanceItem[];
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

export function CreativePerformanceCard({ creatives }: CreativePerformanceCardProps): React.ReactElement {
  const t = useTranslations('GrowthDashboard');

  const formatIcons = {
    video: Video,
    image: Image,
    carousel: LayoutGrid,
    search_text: FileText,
  };

  return (
    <Card className="flex flex-col gap-5 p-6 bg-card border-border shadow-sm">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-pink-500/10 p-1.5 text-pink-600 dark:text-pink-400">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </div>
            <h3 className="text-base font-bold text-foreground">{t('creativesTitle')}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('creativesSubtitle')}</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Award className="h-3.5 w-3.5 text-amber-500" />
          <span>{t('topWinningCreativeLabel')}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {creatives.map((cr) => {
          const Icon = formatIcons[cr.format] ?? FileText;
          return (
            <div
              key={cr.id}
              className={`relative flex flex-col justify-between rounded-2xl border p-4 transition-all ${
                cr.isTopWinner
                  ? 'border-pink-500/50 bg-pink-500/[0.03] dark:bg-pink-500/[0.06] shadow-sm'
                  : 'border-border bg-background'
              }`}
            >
              {cr.isTopWinner ? (
                <div className="absolute -top-2.5 end-3 flex items-center gap-1 rounded-full bg-pink-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
                  <Award className="h-3 w-3" aria-hidden="true" />
                  {t('winnerBadge')}
                </div>
              ) : null}

              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    <span>{t(`format_${cr.format}`)}</span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      cr.channel === 'google_ads'
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : cr.channel === 'meta_ads'
                          ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {cr.channel === 'google_ads' ? 'Google' : cr.channel === 'meta_ads' ? 'Meta' : 'TikTok'}
                  </span>
                </div>

                <p className="mt-3 text-xs font-bold leading-snug text-foreground line-clamp-2" title={cr.headline}>
                  {`“${cr.headline}”`}
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <MousePointerClick className="h-3 w-3" />
                    {t('metricCtr')}
                  </span>
                  <span className="font-bold text-foreground">{`${cr.ctrPct}%`}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('metricRoas')}</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400">{`${cr.roas}x`}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('metricRevenue')}</span>
                  <span className="font-semibold text-foreground">{formatCurrency(cr.revenue)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('metricConversions')}</span>
                  <span className="font-semibold text-foreground">{formatNum(cr.conversions)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
