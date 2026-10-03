'use client';

import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  Activity,
  DollarSign,
  Pause,
  Play,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export type FeedCategory = 'touchpoint' | 'conversion' | 'guardrail';

export interface FeedEventItem {
  id: string;
  timestamp: string;
  category: FeedCategory;
  title: string;
  description: string;
  source: string;
  sourceType: 'meta' | 'google' | 'stripe' | 'sdk' | 'copilot';
  severity: 'info' | 'success' | 'warning';
  amount?: string;
  details?: string;
}

const INITIAL_EVENTS: FeedEventItem[] = [
  {
    id: 'evt-1',
    timestamp: 'Just now',
    category: 'conversion',
    title: 'Enterprise Plan Checkout',
    description: 'Annual Enterprise subscription activated via Stripe billing webhook',
    source: 'Stripe Webhook',
    sourceType: 'stripe',
    severity: 'success',
    amount: '+$2,400',
    details: 'plan: enterprise_annual',
  },
  {
    id: 'evt-2',
    timestamp: '2m ago',
    category: 'touchpoint',
    title: 'High-Intent Ad Click (Google Search)',
    description: 'First-party click attribution landed with gclid match',
    source: 'Google Ads API',
    sourceType: 'google',
    severity: 'info',
    amount: 'Attributed',
    details: 'campaign: b2b_saas_intent',
  },
  {
    id: 'evt-3',
    timestamp: '3m ago',
    category: 'guardrail',
    title: 'CPA Ceiling Guardrail Triggered',
    description: 'Autonomous Kill-Switch paused fatigued adset before exceeding $120 CPA target',
    source: 'Copilot Guardrail',
    sourceType: 'copilot',
    severity: 'warning',
    amount: 'PAUSED',
    details: 'rule: cpa_threshold_exceeded',
  },
  {
    id: 'evt-4',
    timestamp: '5m ago',
    category: 'conversion',
    title: 'Pro Plan Upgrade',
    description: 'Customer expanded from Starter to Pro Tier with 5 seats',
    source: 'Stripe Webhook',
    sourceType: 'stripe',
    severity: 'success',
    amount: '+$890',
    details: 'mrr_delta: +$890',
  },
  {
    id: 'evt-5',
    timestamp: '8m ago',
    category: 'touchpoint',
    title: 'Meta Conversions API (CAPI) Ping',
    description: 'Server-side lead event successfully synced with 100% match quality',
    source: 'Meta CAPI',
    sourceType: 'meta',
    severity: 'info',
    amount: '<14ms',
    details: 'event: LeadSync',
  },
  {
    id: 'evt-6',
    timestamp: '14m ago',
    category: 'guardrail',
    title: 'Budget Burn Pacing Circuit Breaker',
    description: 'Daily pacing automatically adjusted down -15% after anomaly detection',
    source: 'Copilot Guardrail',
    sourceType: 'copilot',
    severity: 'warning',
    amount: '-15% Pacing',
    details: 'rule: max_daily_change_pct',
  },
  {
    id: 'evt-7',
    timestamp: '18m ago',
    category: 'touchpoint',
    title: 'Web SDK Session Ingested',
    description: 'Active visitor session captured with UTM attribution parameters',
    source: 'GrowthOS Web SDK',
    sourceType: 'sdk',
    severity: 'info',
    amount: 'Live',
    details: 'src: direct_organic',
  },
];

export interface OperationalActivityTickerProps {
  initialEvents?: FeedEventItem[];
  orgId?: string;
  projectId?: string;
}

export function OperationalActivityTicker({
  initialEvents = INITIAL_EVENTS,
  orgId,
  projectId,
}: OperationalActivityTickerProps): React.ReactElement {
  const t = useTranslations('DashboardPage');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<'all' | FeedCategory>('all');
  const [events, setEvents] = useState<FeedEventItem[]>(initialEvents);

  // Real-time EventSource listener to project win-rules and live event stream
  useEffect(() => {
    if (!orgId || !projectId || isPaused || typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`/api/orgs/${orgId}/projects/${projectId}/win-rules/feed`);
      eventSource.onmessage = (e) => {
        try {
          const raw = JSON.parse(e.data);
          const newEvent: FeedEventItem = {
            id: raw.id || `evt-${Date.now()}`,
            timestamp: 'Just now',
            category: raw.winType === 'conversion' ? 'conversion' : 'touchpoint',
            title: raw.winRuleName || 'Live Ingest Event',
            description: `Ingested ${raw.schemaName || 'event'} from client ${raw.clientId || 'growthos'}`,
            source: raw.schemaName || 'Live Ingest',
            sourceType: raw.winType === 'conversion' ? 'stripe' : 'sdk',
            severity: raw.winType === 'conversion' ? 'success' : 'info',
            amount: raw.payload?.amount ? `$${raw.payload.amount}` : undefined,
            details: raw.schemaName,
          };
          setEvents((prev) => [newEvent, ...prev.slice(0, 19)]);
        } catch {
          // ignore parsing error
        }
      };
      eventSource.onerror = () => {
        eventSource?.close();
      };
    } catch {
      // EventSource not supported
    }

    return () => {
      eventSource?.close();
    };
  }, [orgId, projectId, isPaused]);


  const categoryCounts = useMemo(() => {
    return {
      all: events.length,
      touchpoint: events.filter((e) => e.category === 'touchpoint').length,
      conversion: events.filter((e) => e.category === 'conversion').length,
      guardrail: events.filter((e) => e.category === 'guardrail').length,
    };
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (selectedCategory === 'all') return events;
    return events.filter((event) => event.category === selectedCategory);
  }, [events, selectedCategory]);

  return (
    <section
      aria-label="Operational Activity Feed"
      className="flex flex-col rounded-2xl border border-border/80 bg-card/70 backdrop-blur-md p-5 sm:p-6 shadow-soft"
    >
      {/* Feed Header with Live/Paused status and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="text-base font-bold tracking-tight text-foreground">
              {t('liveActivityHeading')}
            </h2>
            {/* Live vs Paused Status Indicator */}
            {isPaused ? (
              <Badge variant="warning" size="sm" className="gap-1.5 font-semibold">
                <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                <span>{t('feedStatusPaused')}</span>
              </Badge>
            ) : (
              <Badge variant="emerald" size="sm" className="gap-1.5 font-semibold">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span>{t('feedStatusLive')}</span>
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('liveActivitySubtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPaused((prev) => !prev)}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            {isPaused ? (
              <>
                <Play className="h-3.5 w-3.5 text-emerald-500" />
                <span>{t('resumeFeed')}</span>
              </>
            ) : (
              <>
                <Pause className="h-3.5 w-3.5 text-amber-500" />
                <span>{t('pauseFeed')}</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 py-3 border-b border-border/40">
        {[
          { key: 'all', label: t('feedFilterAll'), count: categoryCounts.all },
          { key: 'touchpoint', label: t('feedFilterTouchpoints'), count: categoryCounts.touchpoint },
          { key: 'conversion', label: t('feedFilterConversions'), count: categoryCounts.conversion },
          { key: 'guardrail', label: t('feedFilterGuardrails'), count: categoryCounts.guardrail },
        ].map((tab) => {
          const isActive = selectedCategory === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSelectedCategory(tab.key as 'all' | FeedCategory)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-soft'
                  : 'bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <span>{tab.label}</span>
              <span
                dir="ltr"
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isActive
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Feed Stream Items */}
      <div className="mt-2 divide-y divide-border/50 max-h-[360px] overflow-y-auto pe-1">
        {events.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {t('noActivityEvents')}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {t('noFeedEvents')}
          </div>
        ) : (
          filteredEvents.map((item) => {
            return (
              <div
                key={item.id}
                className="flex items-start sm:items-center justify-between gap-3 py-3 hover:bg-muted/30 px-2 rounded-xl transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Source Icon Badge */}
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                      item.category === 'conversion'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : item.category === 'guardrail'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                    }`}
                  >
                    {item.category === 'conversion' ? (
                      <DollarSign className="h-4 w-4" />
                    ) : item.category === 'guardrail' ? (
                      <ShieldAlert className="h-4 w-4" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                  </div>

                  <div className="flex flex-col">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        {item.title}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {item.source}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {item.description}
                    </p>
                  </div>
                </div>

                {/* Amount / Metric and Timestamp */}
                <div className="flex flex-col items-end shrink-0">
                  {item.amount ? (
                    <span
                      dir="ltr"
                      className={`font-mono text-xs font-bold ${
                        item.category === 'conversion'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : item.category === 'guardrail'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-foreground'
                      }`}
                    >
                      {item.amount}
                    </span>
                  ) : null}
                  <span dir="ltr" className="text-[10px] text-muted-foreground mt-0.5">
                    {item.timestamp}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
