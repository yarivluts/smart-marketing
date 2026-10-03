'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Activity,
  ArrowUpRight,
  Bot,
  DollarSign,
  Filter,
  Pause,
  Play,
  Plus,
  ShieldAlert,
  Zap,
} from 'lucide-react';

export type EventCategory = 'all' | 'conversions' | 'guardrails' | 'copilot' | 'intent';

export interface IngestedEvent {
  id: string;
  timestamp: string;
  category: 'conversions' | 'guardrails' | 'copilot' | 'intent';
  source: 'Meta Ads CAPI' | 'Google Ads RSA' | 'Stripe' | 'Web SDK' | 'AI Copilot' | 'Cost Guardrail';
  title: string;
  detail: string;
  metrics: string;
  highlightColor: string;
}

const INITIAL_EVENTS: IngestedEvent[] = [
  {
    id: 'evt-1',
    timestamp: 'Just now',
    category: 'conversions',
    source: 'Meta Ads CAPI',
    title: 'Enterprise Subscription Activated',
    detail: '3-touch attribution: Meta (55%) -> Google (30%) -> Direct (15%)',
    metrics: '+$2,400 MRR • ROAS 4.8x',
    highlightColor: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
  },
  {
    id: 'evt-2',
    timestamp: '2s ago',
    category: 'guardrails',
    source: 'Cost Guardrail',
    title: 'Adset Auto-Paused: Creative Fatigue',
    detail: 'CTR dropped below 0.65% with CPA surge >$85 on "US-Lookalike-Q3"',
    metrics: 'Saved ~$1,420 Wasted Spend',
    highlightColor: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  },
  {
    id: 'evt-3',
    timestamp: '6s ago',
    category: 'intent',
    source: 'Web SDK',
    title: 'High-Intent PQL Account Identified',
    detail: 'Datadog Tech (1,200 seats) viewed /pricing & /integrations 4 times',
    metrics: 'Intent Score: 94/100 • Hot Lead',
    highlightColor: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  },
  {
    id: 'evt-4',
    timestamp: '11s ago',
    category: 'copilot',
    source: 'AI Copilot',
    title: 'Autonomous Budget Reallocation Executed',
    detail: 'Shifted $350 daily budget from low-yield Search to high-ROAS Meta retargeting',
    metrics: '+18.4% Projected Conversion Lift',
    highlightColor: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  },
  {
    id: 'evt-5',
    timestamp: '18s ago',
    category: 'conversions',
    source: 'Google Ads RSA',
    title: 'Self-Serve Annual Signup Verified',
    detail: 'First-click attribution to keyword "b2b growth attribution platform"',
    metrics: '+$948 ACV • CAC $112',
    highlightColor: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
  },
];

const RANDOM_EVENT_POOL: Omit<IngestedEvent, 'id' | 'timestamp'>[] = [
  {
    category: 'conversions',
    source: 'Stripe',
    title: 'Expansion MRR Upgrade',
    detail: 'Tier upgrade to Enterprise Unlimited (Additional 25 seats)',
    metrics: '+$1,190 MRR',
    highlightColor: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
  },
  {
    category: 'guardrails',
    source: 'Cost Guardrail',
    title: 'Daily Spend Cap Reached',
    detail: 'Google Search campaign reached 100% of allocated budget ($500)',
    metrics: 'Zero Overspend Confirmed',
    highlightColor: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  },
  {
    category: 'copilot',
    source: 'AI Copilot',
    title: 'Prompt-to-DOM Variant Deployed',
    detail: 'Personalized hero copy served to FinTech audience at edge (<14ms)',
    metrics: 'Significance: 99.1%',
    highlightColor: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  },
  {
    category: 'intent',
    source: 'Web SDK',
    title: 'Multi-Visit Surge Detected',
    detail: '7 visits from Snowflake IP range within 15 minutes',
    metrics: 'Slack AE Alert Dispatched',
    highlightColor: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  },
];

export function LiveEventStreamTicker(): React.ReactElement {
  const t = useTranslations('HomePage');
  const [events, setEvents] = useState<IngestedEvent[]>(INITIAL_EVENTS);
  const [category, setCategory] = useState<EventCategory>('all');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [eventCount, setEventCount] = useState<number>(14820);
  const [speed, setSpeed] = useState<'normal' | 'fast'>('normal');
  const nextIdRef = useRef<number>(6);

  const handleAddSimulatedEvent = () => {
    const template = RANDOM_EVENT_POOL[Math.floor(Math.random() * RANDOM_EVENT_POOL.length)];
    const newEvent: IngestedEvent = {
      ...template,
      id: `evt-${nextIdRef.current++}`,
      timestamp: 'Just now',
    };
    setEvents((prev) => [newEvent, ...prev.slice(0, 14)]);
    setEventCount((prev) => prev + 1);
  };

  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = speed === 'fast' ? 2200 : 4500;
    const interval = setInterval(() => {
      handleAddSimulatedEvent();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isPlaying, speed]);

  const filteredEvents = category === 'all' ? events : events.filter((e) => e.category === category);

  return (
    <section className="py-12 bg-background/50 border-y border-border/40 relative overflow-hidden" data-testid="live-event-stream-ticker">
      {/* Subtle Background Glow */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Top Control Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <Activity className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">
                  {t('streamHeaderTitle')}
                </h3>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="font-mono text-xs text-emerald-600 font-semibold" dir="ltr">&lt;18ms latency</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('streamHeaderSubtitle')}
              </p>
            </div>
          </div>

          {/* Controls & Metrics */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {/* Live Counter */}
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-mono font-medium text-muted-foreground shadow-xs">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span>{t('streamEventsToday')}:</span>
              <strong className="text-foreground" dir="ltr">{eventCount.toLocaleString()}</strong>
            </div>

            {/* Speed Toggle */}
            <button
              type="button"
              onClick={() => setSpeed(speed === 'normal' ? 'fast' : 'normal')}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                speed === 'fast'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {speed === 'fast' ? '⚡ 3x Speed' : '1x Speed'}
            </button>

            {/* Play/Pause Button */}
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              title={isPlaying ? 'Pause Stream' : 'Resume Stream'}
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5 text-amber-500" /> : <Play className="h-3.5 w-3.5 text-emerald-500" />}
              <span>{isPlaying ? t('streamPause') : t('streamResume')}</span>
            </button>

            {/* Manual Simulate Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddSimulatedEvent}
              className="h-8 gap-1.5 text-xs font-bold border-primary/30 text-primary hover:bg-primary/10"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t('streamSimulateEventBtn')}</span>
            </Button>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-4 pb-4">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Filter className="h-3 w-3" /> {t('streamFilter')}:
          </span>
          {[
            { id: 'all', label: t('streamFilterAll') },
            { id: 'conversions', label: t('streamFilterConversions') },
            { id: 'guardrails', label: t('streamFilterGuardrails') },
            { id: 'copilot', label: t('streamFilterCopilot') },
            { id: 'intent', label: t('streamFilterIntent') },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id as EventCategory)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                category === cat.id
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Live Event Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredEvents.slice(0, 6).map((item) => {
            const isConversions = item.category === 'conversions';
            const isGuardrail = item.category === 'guardrails';
            const isCopilot = item.category === 'copilot';

            return (
              <div
                key={item.id}
                className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-card/80 p-4 shadow-xs hover:border-primary/40 hover:shadow-soft transition-all duration-200 backdrop-blur-sm"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-lg border ${item.highlightColor}`}
                      >
                        {isConversions && <DollarSign className="h-3 w-3" />}
                        {isGuardrail && <ShieldAlert className="h-3 w-3" />}
                        {isCopilot && <Bot className="h-3 w-3" />}
                        {!isConversions && !isGuardrail && !isCopilot && <ArrowUpRight className="h-3 w-3" />}
                      </span>
                      <span className="text-[11px] font-bold text-muted-foreground tracking-wide uppercase">
                        {item.source}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground/80">{item.timestamp}</span>
                  </div>

                  <h4 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                    {item.title}
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                    {item.detail}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono" dir="ltr">
                    {item.metrics}
                  </span>
                  <Badge variant="secondary" size="sm" className="text-[10px] font-mono">
                    {item.category}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
