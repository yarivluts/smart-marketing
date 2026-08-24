'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Users,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Share2,
  Flame,
  Crown,
  Clock,
  RotateCcw,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface PredefinedMarketingAudience {
  id: string;
  nameKey: string;
  descKey: string;
  badgeKey: string;
  iconType: 'abandon' | 'vip' | 'expiring' | 'churn' | 'lookalike';
  size: number;
  matchRatePct: number;
  syncedChannels: ('google' | 'meta' | 'tiktok')[];
  aiRecommendationKey: string;
  lastUpdated: string;
}

export function MarketingAudiencesDashboard({ projectName }: { projectName: string }) {
  const t = useTranslations('MarketingAudiences');

  const audiences: PredefinedMarketingAudience[] = [
    {
      id: 'aud-cart-abandoners',
      nameKey: 'audCartAbandonersName',
      descKey: 'audCartAbandonersDesc',
      badgeKey: 'badgeHighIntent',
      iconType: 'abandon',
      size: 1420,
      matchRatePct: 88.4,
      syncedChannels: ['meta', 'google'],
      aiRecommendationKey: 'recCartAbandoners',
      lastUpdated: '10m ago',
    },
    {
      id: 'aud-vip-buyers',
      nameKey: 'audVipBuyersName',
      descKey: 'audVipBuyersDesc',
      badgeKey: 'badgeHighLtv',
      iconType: 'vip',
      size: 840,
      matchRatePct: 94.1,
      syncedChannels: ['meta', 'google', 'tiktok'],
      aiRecommendationKey: 'recVipBuyers',
      lastUpdated: '1h ago',
    },
    {
      id: 'aud-expiring-trials',
      nameKey: 'audExpiringTrialsName',
      descKey: 'audExpiringTrialsDesc',
      badgeKey: 'badgeTrialUrgency',
      iconType: 'expiring',
      size: 310,
      matchRatePct: 91.0,
      syncedChannels: ['meta', 'google'],
      aiRecommendationKey: 'recExpiringTrials',
      lastUpdated: '25m ago',
    },
    {
      id: 'aud-dormant-churn',
      nameKey: 'audDormantChurnName',
      descKey: 'audDormantChurnDesc',
      badgeKey: 'badgeWinback',
      iconType: 'churn',
      size: 2150,
      matchRatePct: 82.6,
      syncedChannels: ['meta', 'google'],
      aiRecommendationKey: 'recDormantChurn',
      lastUpdated: '2h ago',
    },
    {
      id: 'aud-top-converters',
      nameKey: 'audTopConvertersName',
      descKey: 'audTopConvertersDesc',
      badgeKey: 'badgeLookalikeSeed',
      iconType: 'lookalike',
      size: 620,
      matchRatePct: 96.2,
      syncedChannels: ['meta', 'google', 'tiktok'],
      aiRecommendationKey: 'recTopConverters',
      lastUpdated: '15m ago',
    },
  ];

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncedIds, setSyncedIds] = useState<Set<string>>(new Set());

  const handleSyncAll = (audId: string) => {
    setSyncingId(audId);
    setTimeout(() => {
      setSyncingId(null);
      setSyncedIds((prev) => new Set([...prev, audId]));
    }, 800);
  };

  const getIcon = (type: PredefinedMarketingAudience['iconType']) => {
    switch (type) {
      case 'abandon':
        return <Flame className="h-5 w-5 text-rose-500" />;
      case 'vip':
        return <Crown className="h-5 w-5 text-amber-500" />;
      case 'expiring':
        return <Clock className="h-5 w-5 text-indigo-500" />;
      case 'churn':
        return <RotateCcw className="h-5 w-5 text-purple-500" />;
      case 'lookalike':
        return <Star className="h-5 w-5 text-emerald-500" />;
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                {t('pageHeading', { projectName })}
              </h1>
              <p className="text-xs text-muted-foreground">{t('pageSubtitle')}</p>
            </div>
          </div>
        </div>

        {/* Global Live Status */}
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span>{t('audiencesLiveSynced')}</span>
        </div>
      </div>

      {/* Audiences Grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {audiences.map((aud) => {
          const isSyncing = syncingId === aud.id;
          const isJustSynced = syncedIds.has(aud.id);

          return (
            <div
              key={aud.id}
              className="flex flex-col justify-between gap-5 rounded-3xl border border-border bg-card p-6 shadow-sm transition-all hover:border-primary/40 hover:shadow-soft"
            >
              {/* Header */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-muted">
                      {getIcon(aud.iconType)}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">
                        {t(aud.nameKey as Parameters<typeof t>[0])}
                      </h3>
                      <span className="text-[11px] font-semibold text-primary">
                        {t(aud.badgeKey as Parameters<typeof t>[0])}
                      </span>
                    </div>
                  </div>

                  {/* Audience Sizing Badge */}
                  <div className="flex flex-col items-end">
                    <span className="text-lg font-black text-foreground">
                      {aud.size.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{t('usersCountLabel')}</span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  {t(aud.descKey as Parameters<typeof t>[0])}
                </p>
              </div>

              {/* Match Quality & Channels */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/60 p-3 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                  <span>{t('matchQualityLabel')}{':'}</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {aud.matchRatePct}{'%'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{t('autoSyncTo')}{':'}</span>
                  <div className="flex items-center gap-1">
                    {aud.syncedChannels.map((ch) => (
                      <span
                        key={ch}
                        className="rounded-lg bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-foreground"
                      >
                        {ch}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Recommendation Box */}
              <div className="flex items-start gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-3 text-xs">
                <Sparkles className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-foreground">{t('aiTacticalPlay')}</span>
                  <span className="text-muted-foreground leading-relaxed">
                    {t(aud.aiRecommendationKey as Parameters<typeof t>[0])}
                  </span>
                </div>
              </div>

              {/* Footer / 1-Click Sync Button */}
              <div className="flex items-center justify-between border-t border-border/70 pt-3">
                <span className="text-[11px] text-muted-foreground">
                  {t('lastRefreshedLabel')}{': '}
                  {aud.lastUpdated}
                </span>

                <Button
                  size="sm"
                  variant={isJustSynced ? 'outline' : 'default'}
                  onClick={() => handleSyncAll(aud.id)}
                  disabled={isSyncing}
                  className="rounded-xl px-4 text-xs font-bold"
                >
                  {isSyncing ? (
                    <>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      <span>{t('syncingBtn')}</span>
                    </>
                  ) : isJustSynced ? (
                    <>
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                      <span>{t('syncedBtn')}</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="mr-1.5 h-3.5 w-3.5" />
                      <span>{t('syncChannelsBtn')}</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
