'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Bot,
  Sparkles,
  Zap,
  TrendingUp,
  ShieldCheck,
  Power,
  Play,
  CheckCircle2,
  Flame,
  Search,
  Video,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface SerializedAutomationAction {
  id: string;
  actionType: string;
  targetLabel: string;
  status: string;
  impact: string;
  proposedAt: string;
}

export function MarketingAutomationCopilot({
  projectName,
  actions = [],
}: {
  projectName: string;
  actions?: SerializedAutomationAction[];
}) {
  const t = useTranslations('MarketingAutomation');

  const [copilotActive, setCopilotActive] = useState<boolean>(true);
  const roasFloor = 2.0;
  const maxDailyShiftPct = 20;
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [launchedIds, setLaunchedIds] = useState<Set<string>>(new Set());


  const handleLaunchCampaign = (id: string) => {
    setLaunchingId(id);
    setTimeout(() => {
      setLaunchingId(null);
      setLaunchedIds((prev) => new Set([...prev, id]));
    }, 1000);
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header & Master Copilot Status */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                {t('pageHeading', { projectName })}
              </h1>
              <p className="text-xs text-muted-foreground">{t('pageSubtitle')}</p>
            </div>
          </div>
        </div>

        {/* Master Copilot Toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-xs font-bold">
            <div
              className={`h-2.5 w-2.5 rounded-full ${
                copilotActive ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'
              }`}
            />
            <span className={copilotActive ? 'text-foreground' : 'text-muted-foreground'}>
              {copilotActive ? t('copilotStatusActive') : t('copilotStatusPaused')}
            </span>
          </div>

          <Button
            size="sm"
            variant={copilotActive ? 'outline' : 'default'}
            onClick={() => setCopilotActive(!copilotActive)}
            className="rounded-xl px-4 text-xs font-bold"
          >
            <Power className="mr-1.5 h-3.5 w-3.5" />
            <span>{copilotActive ? t('pauseCopilotBtn') : t('resumeCopilotBtn')}</span>
          </Button>
        </div>
      </div>

      {/* Autonomous Impact Summary Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-3xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            <span>{t('metricDailyOptimizations')}</span>
          </div>
          <div className="text-2xl font-black text-foreground">
            {'18'} {t('actionsExecuted')}
          </div>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            {t('zeroManualIntervention')}
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded-3xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Flame className="h-3.5 w-3.5 text-rose-500" />
            <span>{t('metricBudgetReallocated')}</span>
          </div>
          <div className="text-2xl font-black text-foreground">
            {'₪2,480'}
          </div>
          <span className="text-[11px] font-semibold text-primary">
            {t('shiftedToHighRoas')}
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded-3xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            <span>{t('metricRoasUplift')}</span>
          </div>
          <div className="text-2xl font-black text-foreground">
            {'+14.2%'}
          </div>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            {t('vsManualBaseline')}
          </span>
        </div>
      </div>

      {/* 1-Click Campaign Launchpad */}
      <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            <div>
              <h2 className="text-base font-bold text-foreground">
                {t('launchpadHeading')}
              </h2>
              <p className="text-xs text-muted-foreground">{t('launchpadSubtitle')}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Preset 1: High Intent Search */}
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-background p-4 shadow-xs">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <Search className="h-4 w-4 text-blue-500" />
                  <span>{t('packSearchTitle')}</span>
                </div>
                <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                  {'Google Ads'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t('packSearchDesc')}
              </p>
            </div>

            <Button
              size="sm"
              onClick={() => handleLaunchCampaign('search')}
              disabled={launchingId === 'search' || launchedIds.has('search')}
              className="rounded-xl text-xs font-bold"
            >
              {launchingId === 'search' ? (
                <span>{t('launchingBtn')}</span>
              ) : launchedIds.has('search') ? (
                <>
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-400" />
                  <span>{t('campaignActiveBtn')}</span>
                </>
              ) : (
                <>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  <span>{t('launch1ClickBtn')}</span>
                </>
              )}
            </Button>
          </div>

          {/* Preset 2: Meta Video Retargeting */}
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-background p-4 shadow-xs">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <Video className="h-4 w-4 text-indigo-500" />
                  <span>{t('packVideoTitle')}</span>
                </div>
                <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                  {'Meta Ads'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t('packVideoDesc')}
              </p>
            </div>

            <Button
              size="sm"
              onClick={() => handleLaunchCampaign('video')}
              disabled={launchingId === 'video' || launchedIds.has('video')}
              className="rounded-xl text-xs font-bold"
            >
              {launchingId === 'video' ? (
                <span>{t('launchingBtn')}</span>
              ) : launchedIds.has('video') ? (
                <>
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-400" />
                  <span>{t('campaignActiveBtn')}</span>
                </>
              ) : (
                <>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  <span>{t('launch1ClickBtn')}</span>
                </>
              )}
            </Button>
          </div>

          {/* Preset 3: Performance Max */}
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-background p-4 shadow-xs">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <Layers className="h-4 w-4 text-emerald-500" />
                  <span>{t('packPmaxTitle')}</span>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  {'Cross-Channel'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t('packPmaxDesc')}
              </p>
            </div>

            <Button
              size="sm"
              onClick={() => handleLaunchCampaign('pmax')}
              disabled={launchingId === 'pmax' || launchedIds.has('pmax')}
              className="rounded-xl text-xs font-bold"
            >
              {launchingId === 'pmax' ? (
                <span>{t('launchingBtn')}</span>
              ) : launchedIds.has('pmax') ? (
                <>
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-400" />
                  <span>{t('campaignActiveBtn')}</span>
                </>
              ) : (
                <>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  <span>{t('launch1ClickBtn')}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Autonomous Guardrails & Live Action Log */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Safety Guardrails */}
        <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            <h3 className="text-sm font-bold text-foreground">{t('guardrailsHeading')}</h3>
          </div>

          <div className="flex flex-col gap-4 text-xs">
            <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-background p-3.5">
              <div className="flex items-center justify-between font-bold">
                <span>{t('roasFloorLabel')}</span>
                <span className="text-primary font-black">{roasFloor.toFixed(1)}{'x ROAS'}</span>
              </div>
              <p className="text-muted-foreground">{t('roasFloorDesc')}</p>
            </div>

            <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-background p-3.5">
              <div className="flex items-center justify-between font-bold">
                <span>{t('maxShiftVelocityLabel')}</span>
                <span className="text-primary font-black">{maxDailyShiftPct}{'%'} {t('perDay')}</span>
              </div>
              <p className="text-muted-foreground">{t('maxShiftVelocityDesc')}</p>
            </div>
          </div>
        </div>

        {/* Live Autonomous Actions Feed */}
        <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              <h3 className="text-sm font-bold text-foreground">{t('recentActionsHeading')}</h3>
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground">
              {t('autoLogged')}
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {actions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                <p>{'No autonomous actions executed yet. Copilot is actively monitoring connected ad accounts.'}</p>
              </div>
            ) : (
              actions.map((act) => (
                <div
                  key={act.id}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-border/80 bg-background/60 p-3.5 text-xs"
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground">
                        {act.targetLabel}
                      </span>
                      <span className="rounded-md bg-muted px-1.5 py-0.2 text-[10px] font-bold uppercase text-foreground">
                        {act.actionType}
                      </span>
                    </div>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                      {act.impact}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                    {new Date(act.proposedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
