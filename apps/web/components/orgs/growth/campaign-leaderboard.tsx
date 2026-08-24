'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Crown, Sparkles, TrendingUp, AlertTriangle } from 'lucide-react';
import type { CampaignLeaderboardItem } from './types';

export interface CampaignLeaderboardProps {
  campaigns: CampaignLeaderboardItem[];
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

export function CampaignLeaderboard({ campaigns }: CampaignLeaderboardProps): React.ReactElement {
  const t = useTranslations('GrowthDashboard');

  return (
    <Card className="flex flex-col gap-5 p-6 bg-card border-border shadow-sm">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-amber-500/10 p-1.5 text-amber-600 dark:text-amber-400">
              <Crown className="h-4 w-4" aria-hidden="true" />
            </div>
            <h3 className="text-base font-bold text-foreground">{t('campaignLeaderboardTitle')}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('campaignLeaderboardSubtitle')}</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('aiAutoAttributed')}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-start text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="pb-3 text-start font-semibold">{t('thRank')}</th>
              <th className="pb-3 text-start font-semibold">{t('thCampaignName')}</th>
              <th className="pb-3 text-start font-semibold">{t('thPlatform')}</th>
              <th className="pb-3 text-end font-semibold">{t('thSpend')}</th>
              <th className="pb-3 text-end font-semibold">{t('thConversions')}</th>
              <th className="pb-3 text-end font-semibold">{t('thCpa')}</th>
              <th className="pb-3 text-end font-semibold">{t('thRevenue')}</th>
              <th className="pb-3 text-end font-semibold">{t('thRoas')}</th>
              <th className="pb-3 text-end font-semibold">{t('thRecommendation')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {campaigns.map((cmp, idx) => {
              const isTop = cmp.isTopPerformer ?? idx === 0;
              return (
                <tr
                  key={cmp.id}
                  className={`transition-colors hover:bg-muted/40 ${
                    isTop ? 'bg-amber-500/[0.04] dark:bg-amber-500/[0.08] font-medium' : ''
                  }`}
                >
                  <td className="py-3.5 text-start">
                    {isTop ? (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white shadow-xs">
                        <Crown className="h-3.5 w-3.5" aria-hidden="true" />
                      </div>
                    ) : (
                      <span className="font-semibold text-muted-foreground ms-1.5">{`#${idx + 1}`}</span>
                    )}
                  </td>
                  <td className="py-3.5 text-start font-semibold text-foreground max-w-[220px] truncate">
                    <div className="flex items-center gap-2">
                      <span className="truncate" title={cmp.name}>
                        {cmp.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 text-start">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        cmp.channel === 'google_ads'
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : cmp.channel === 'meta_ads'
                            ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {cmp.channel === 'google_ads' ? 'Google' : cmp.channel === 'meta_ads' ? 'Meta' : 'TikTok'}
                    </span>
                  </td>
                  <td className="py-3.5 text-end text-muted-foreground">{formatCurrency(cmp.spend)}</td>
                  <td className="py-3.5 text-end font-semibold text-foreground">{formatNum(cmp.conversions)}</td>
                  <td className="py-3.5 text-end text-muted-foreground">{formatCurrency(cmp.cpa)}</td>
                  <td className="py-3.5 text-end font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(cmp.revenue)}
                  </td>
                  <td className="py-3.5 text-end">
                    <span
                      className={`rounded-md px-2 py-0.5 font-bold ${
                        cmp.roas >= 4.0
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : cmp.roas >= 2.5
                            ? 'bg-primary/10 text-primary'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {`${cmp.roas}x`}
                    </span>
                  </td>
                  <td className="py-3.5 text-end">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                        isTop
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : cmp.roas < 2.0
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isTop ? <TrendingUp className="h-3 w-3" /> : null}
                      {cmp.roas < 2.0 ? <AlertTriangle className="h-3 w-3" /> : null}
                      {t(cmp.recommendationKey)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
