'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Trophy,
  Sparkles,
  Tv,
  Volume2,
  PartyPopper,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export interface PredefinedWinRule {
  id: string;
  titleKey: string;
  descKey: string;
  triggerConditionKey: string;
  celebrationStyleKey: string;
  enabled: boolean;
  timesFiredToday: number;
}

export interface LiveWinEventItem {
  id: string;
  headlineKey: string;
  customerName: string;
  amount: string;
  channel: 'google' | 'meta' | 'direct' | 'tiktok';
  timestamp: string;
  celebrationEmoji: string;
}

export function MarketingWinRulesDashboard({
  orgId,
  projectId,
  projectName,
}: {
  orgId: string;
  projectId: string;
  projectName: string;
}) {
  const t = useTranslations('MarketingWinRules');

  const [rules, setRules] = useState<PredefinedWinRule[]>([
    {
      id: 'rule-enterprise-saas',
      titleKey: 'ruleEnterpriseTitle',
      descKey: 'ruleEnterpriseDesc',
      triggerConditionKey: 'condEnterprise',
      celebrationStyleKey: 'styleGoldCelebration',
      enabled: true,
      timesFiredToday: 2,
    },
    {
      id: 'rule-highticket-order',
      titleKey: 'ruleHighTicketTitle',
      descKey: 'ruleHighTicketDesc',
      triggerConditionKey: 'condHighTicket',
      celebrationStyleKey: 'styleConfettiSound',
      enabled: true,
      timesFiredToday: 6,
    },
    {
      id: 'rule-roas-milestone',
      titleKey: 'ruleRoasMilestoneTitle',
      descKey: 'ruleRoasMilestoneDesc',
      triggerConditionKey: 'condRoasMilestone',
      celebrationStyleKey: 'styleChannelBanner',
      enabled: true,
      timesFiredToday: 1,
    },
    {
      id: 'rule-daily-conversions',
      titleKey: 'ruleDailyConversionsTitle',
      descKey: 'ruleDailyConversionsDesc',
      triggerConditionKey: 'condDailyConversions',
      celebrationStyleKey: 'styleTeamWarRoom',
      enabled: true,
      timesFiredToday: 0,
    },
  ]);

  const liveWins: LiveWinEventItem[] = [
    {
      id: 'win-1',
      headlineKey: 'eventEnterpriseSigned',
      customerName: 'AeroTech Systems Ltd',
      amount: '₪3,600 / yr',
      channel: 'google',
      timestamp: '4m ago',
      celebrationEmoji: '🎉',
    },
    {
      id: 'win-2',
      headlineKey: 'eventHighTicketOrder',
      customerName: 'Danielle Shavit',
      amount: '₪640.00',
      channel: 'meta',
      timestamp: '22m ago',
      celebrationEmoji: '🛍️',
    },
    {
      id: 'win-3',
      headlineKey: 'eventRoasMilestoneBroken',
      customerName: 'High-Intent Search Campaign #1',
      amount: '5.42x ROAS',
      channel: 'google',
      timestamp: '1h ago',
      celebrationEmoji: '🔥',
    },
    {
      id: 'win-4',
      headlineKey: 'eventProPlanSubscribed',
      customerName: 'Nimrod Cohen',
      amount: '₪249 / mo',
      channel: 'direct',
      timestamp: '2h ago',
      celebrationEmoji: '⚡',
    },
  ];

  const handleToggleRule = (id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
    );
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                {t('pageHeading', { projectName })}
              </h1>
              <p className="text-xs text-muted-foreground">{t('pageSubtitle')}</p>
            </div>
          </div>
        </div>

        {/* TV Mode Launch Button */}
        <Link href={`/orgs/${orgId}/projects/${projectId}/tv`}>
          <Button className="rounded-2xl gap-2 font-bold shadow-soft">
            <Tv className="h-4 w-4" />
            <span>{t('launchTvModeBtn')}</span>
          </Button>
        </Link>
      </div>

      {/* Live Win Stream / War Room Activity */}
      <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-amber-500" />
            <h2 className="text-base font-bold text-foreground">{t('liveWinsStreamHeading')}</h2>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{t('listeningLive')}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {liveWins.map((win) => (
            <div
              key={win.id}
              className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-background p-4 shadow-xs"
            >
              <div className="flex items-start justify-between">
                <span className="text-2xl">{win.celebrationEmoji}</span>
                <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-foreground">
                  {win.channel}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-foreground">
                  {t(win.headlineKey as Parameters<typeof t>[0])}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  {win.customerName}
                </span>
                <span className="text-base font-black text-primary mt-1">{win.amount}</span>
              </div>
              <div className="text-[10px] text-muted-foreground border-t border-border/60 pt-2">
                {win.timestamp}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Predefined Win Trigger Rules */}
      <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-bold text-foreground">
                {t('predefinedTriggersHeading')}
              </h2>
              <p className="text-xs text-muted-foreground">{t('predefinedTriggersSubtitle')}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-background p-5 shadow-xs"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-bold text-foreground">
                    {t(rule.titleKey as Parameters<typeof t>[0])}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(rule.descKey as Parameters<typeof t>[0])}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={rule.enabled ? 'default' : 'outline'}
                  onClick={() => handleToggleRule(rule.id)}
                  className="rounded-xl text-xs font-bold shrink-0"
                >
                  {rule.enabled ? t('ruleActive') : t('ruleDisabled')}
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-primary">
                  <Volume2 className="h-3.5 w-3.5" />
                  <span>{t(rule.celebrationStyleKey as Parameters<typeof t>[0])}</span>
                </div>
                <span className="font-bold text-muted-foreground">
                  {t('firedTodayCount', { count: rule.timesFiredToday })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
