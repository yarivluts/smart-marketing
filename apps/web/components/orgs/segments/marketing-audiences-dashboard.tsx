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
import { MarketingEmptyState } from '@/components/orgs/marketing-empty-state';

export interface SerializedSegment {
  id: string;
  name: string;
  schemaName: string;
  size: number;
  matchQuality: number;
  channels: string[];
  tactic?: string;
  createdAt: string;
}

export function MarketingAudiencesDashboard({
  projectName,
  audiences = [],
}: {
  projectName: string;
  audiences?: SerializedSegment[];
}) {
  const t = useTranslations('MarketingAudiences');
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncedIds, setSyncedIds] = useState<Set<string>>(new Set());

  if (audiences.length === 0) {
    return (
      <MarketingEmptyState
        Icon={Users}
        heading={t('emptyStateHeading', { projectName })}
        description={t('emptyStateDesc')}
        ctaLabel={t('emptyStateCta')}
      />
    );
  }

  const handleSyncAll = (audId: string) => {
    setSyncingId(audId);
    setTimeout(() => {
      setSyncingId(null);
      setSyncedIds((prev) => new Set([...prev, audId]));
    }, 800);
  };

  const getIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('abandon') || lower.includes('cart')) {
      return <Flame className="h-5 w-5 text-rose-500" />;
    }
    if (lower.includes('vip') || lower.includes('buyer') || lower.includes('ltv')) {
      return <Crown className="h-5 w-5 text-amber-500" />;
    }
    if (lower.includes('trial') || lower.includes('expir')) {
      return <Clock className="h-5 w-5 text-indigo-500" />;
    }
    if (lower.includes('churn') || lower.includes('dormant') || lower.includes('winback')) {
      return <RotateCcw className="h-5 w-5 text-purple-500" />;
    }
    return <Star className="h-5 w-5 text-emerald-500" />;
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
          const channels = aud.channels.length > 0 ? aud.channels : ['google', 'meta'];

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
                      {getIcon(aud.name)}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">
                        {aud.name}
                      </h3>
                      <span className="text-[11px] font-semibold text-primary">
                        {aud.schemaName}
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
              </div>

              {/* Match Quality & Channels */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/60 p-3 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                  <span>{t('matchQualityLabel')}{':'}</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {aud.matchQuality}{'%'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{t('autoSyncTo')}{':'}</span>
                  <div className="flex items-center gap-1">
                    {channels.map((ch) => (
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
              {aud.tactic && (
                <div className="flex items-start gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-3 text-xs">
                  <Sparkles className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-foreground">{t('aiTacticalPlay')}</span>
                    <span className="text-muted-foreground leading-relaxed">
                      {aud.tactic}
                    </span>
                  </div>
                </div>
              )}

              {/* Footer / 1-Click Sync Button */}
              <div className="flex items-center justify-between border-t border-border/70 pt-3">
                <span className="text-[11px] text-muted-foreground">
                  {t('lastRefreshedLabel')}{': '}
                  {new Date(aud.createdAt).toLocaleDateString()}
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

