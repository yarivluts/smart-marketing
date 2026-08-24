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

export interface SerializedWinRule {
  id: string;
  name: string;
  schemaName: string;
  winType: string;
  active: boolean;
  label?: string;
  firedToday?: number;
}

export interface SerializedWinEvent {
  id: string;
  winRuleName: string;
  winType: string;
  title: string;
  amount: string;
  occurredAt: string;
}

export function MarketingWinRulesDashboard({
  orgId,
  projectId,
  projectName,
  rules: initialRules = [],
  events = [],
}: {
  orgId: string;
  projectId: string;
  projectName: string;
  rules?: SerializedWinRule[];
  events?: SerializedWinEvent[];
}) {
  const t = useTranslations('MarketingWinRules');
  const [rules, setRules] = useState<SerializedWinRule[]>(initialRules);

  const handleToggleRule = (id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, active: !r.active } : r)),
    );
  };

  const getCelebrationEmoji = (winType: string) => {
    if (winType.includes('enterprise') || winType.includes('deal')) return '🎉';
    if (winType.includes('ticket') || winType.includes('order')) return '🛍️';
    if (winType.includes('roas') || winType.includes('milestone')) return '🔥';
    return '⚡';
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

        {events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
            <p>{t('emptyStateDesc')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {events.map((win) => (
              <div
                key={win.id}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-background p-4 shadow-xs"
              >
                <div className="flex items-start justify-between">
                  <span className="text-2xl">{getCelebrationEmoji(win.winType)}</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-foreground">
                    {win.winType}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-bold text-foreground">
                    {win.title}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {win.winRuleName}
                  </span>
                  {win.amount && (
                    <span className="text-base font-black text-primary mt-1">{win.amount}</span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground border-t border-border/60 pt-2">
                  {new Date(win.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        )}
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

        {rules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
            <p>{t('emptyStateDesc')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-background p-5 shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-bold text-foreground">
                      {rule.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {rule.schemaName}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant={rule.active ? 'default' : 'outline'}
                    onClick={() => handleToggleRule(rule.id)}
                    className="rounded-xl text-xs font-bold shrink-0"
                  >
                    {rule.active ? t('ruleActive') : t('ruleDisabled')}
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-primary">
                    <Volume2 className="h-3.5 w-3.5" />
                    <span>{rule.label || rule.winType}</span>
                  </div>
                  <span className="font-bold text-muted-foreground">
                    {t('firedTodayCount', { count: rule.firedToday ?? 0 })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

