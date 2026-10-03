'use client';

import React, { useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  DollarSign,
  Gauge,
  Rocket,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';
import { PageGuideButton } from '@/components/guides/page-guide-button';

export interface ExecutiveCommandCenterProps {
  orgId?: string;
  projectId?: string;
  projectName?: string;
  isDataConnected?: boolean;
  missingConnectors?: string[];
  onExecuteCopilotAction?: () => void;
}

type TimeWindow = 'today' | 'yesterday' | '7d';
type AttributionModel = 'shapley' | 'first_touch' | 'last_touch' | 'linear';

interface ConversionFeedItem {
  id: string;
  email: string;
  action: string;
  platform: 'meta' | 'google' | 'tiktok';
  campaign: string;
  timeAgo: string;
  amount: string;
  type: 'sale' | 'lead' | 'trial';
}

const SAMPLE_FEED: ConversionFeedItem[] = [
  {
    id: '1',
    email: 'j.doe@example.com',
    action: 'purchased Enterprise Plan',
    platform: 'meta',
    campaign: 'retargeting_v3',
    timeAgo: 'Just now',
    amount: '+$2,400',
    type: 'sale',
  },
  {
    id: '2',
    email: 'alex.smith@tech.io',
    action: 'booked a demo',
    platform: 'google',
    campaign: 'b2b_saas_intent',
    timeAgo: '2m ago',
    amount: 'Lead',
    type: 'lead',
  },
  {
    id: '3',
    email: 'marketing@startup.co',
    action: 'signed up (Free Trial)',
    platform: 'tiktok',
    campaign: 'creator_ugc_04',
    timeAgo: '5m ago',
    amount: 'Trial',
    type: 'trial',
  },
  {
    id: '4',
    email: 'elena.r@growthlab.com',
    action: 'upgraded to Team Tier',
    platform: 'meta',
    campaign: 'expansion_lookalike',
    timeAgo: '12m ago',
    amount: '+$890',
    type: 'sale',
  },
  {
    id: '5',
    email: 'cto@globalcorp.net',
    action: 'converted Annual Contract',
    platform: 'google',
    campaign: 'brand_search_core',
    timeAgo: '24m ago',
    amount: '+$12,500',
    type: 'sale',
  },
];

export function ExecutiveCommandCenter({
  orgId = 'demo-org',
  projectId = 'demo-project',
  projectName = 'EasySign SaaS',
  isDataConnected = true,
  missingConnectors = [],
  onExecuteCopilotAction,
}: ExecutiveCommandCenterProps) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('today');
  const [attribution, setAttribution] = useState<AttributionModel>('shapley');
  const [activeTooltip] = useState<boolean>(true);
  const [copilotExecuted, setCopilotExecuted] = useState<boolean>(false);

  const handleCopilotAction = () => {
    setCopilotExecuted(true);
    onExecuteCopilotAction?.();
  };

  const dashboardContent = (
    <div className="space-y-6" data-testid="executive-command-center">
      {/* Top Header & Interactive Filter Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              Live 60s Stream
            </span>
            <span className="text-xs text-muted-foreground">• {projectName}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Executive Command Center
            </h1>
            <PageGuideButton pageKey="pulse" />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Real-time cross-channel performance, revenue pacing, and autonomous growth guardrails.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Time Window Buttons */}
          <div className="inline-flex rounded-full border border-border bg-card p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setTimeWindow('today')}
              className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-all ${
                timeWindow === 'today'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Today (Live)
            </button>
            <button
              type="button"
              onClick={() => setTimeWindow('yesterday')}
              className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-all ${
                timeWindow === 'yesterday'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => setTimeWindow('7d')}
              className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-all ${
                timeWindow === '7d'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              7 Days
            </button>
          </div>

          {/* Attribution Dropdown */}
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-sm">
            <span className="text-muted-foreground">Attribution:</span>
            <select
              value={attribution}
              onChange={(e) => setAttribution(e.target.value as AttributionModel)}
              className="bg-transparent font-semibold text-foreground focus:outline-none"
              aria-label="Attribution Model"
            >
              <option value="shapley">Data-Driven (Shapley)</option>
              <option value="first_touch">First Touch</option>
              <option value="last_touch">Last Touch</option>
              <option value="linear">Linear Multi-Touch</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4 Executive KPI Scorecards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Spend */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <DollarSign className="h-5 w-5" />
            </div>
            <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
              <TrendingUp className="h-3.5 w-3.5" />
              +12.4% vs lw
            </span>
          </div>
          <p className="mt-3 text-xs font-medium text-muted-foreground">Total Blended Spend</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              $14,280
            </span>
            <span className="text-xs text-muted-foreground">USD</span>
          </div>
        </div>

        {/* KPI 2: Blended ROAS */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Rocket className="h-5 w-5" />
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <ArrowUpRight className="h-3 w-3" />
              +18.4% Lift
            </span>
          </div>
          <p className="mt-3 text-xs font-medium text-muted-foreground">Blended ROAS</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              3.84x
            </span>
            <span className="text-xs font-semibold text-emerald-600">High Efficiency</span>
          </div>
        </div>

        {/* KPI 3: Marketing Efficiency Ratio (MER) */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Gauge className="h-5 w-5" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">Target: 30%</span>
          </div>
          <p className="mt-3 text-xs font-medium text-muted-foreground">
            Marketing Efficiency (MER)
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              26.8%
            </span>
            <span className="text-xs text-muted-foreground">Spend / Revenue</span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: '89%' }}
            />
          </div>
        </div>

        {/* KPI 4: Net Contribution Margin */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-2 py-0.5 text-xs font-bold text-teal-700 dark:text-teal-400">
              33.7% Margin
            </span>
          </div>
          <p className="mt-3 text-xs font-medium text-muted-foreground">
            Net Contribution Margin
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              $48,200
            </span>
            <span className="text-xs text-muted-foreground">Net Profit</span>
          </div>
        </div>
      </div>

      {/* Main Intraday Pacing Chart */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold tracking-tight text-foreground sm:text-lg">
              Intraday Revenue vs Ad Spend Pacing
            </h2>
            <span className="inline-flex items-center gap-1 rounded border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
              Live WebSocket
            </span>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
              <span className="text-muted-foreground">Meta ($4.3k)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="text-muted-foreground">Google ($3.2k)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-purple-500" />
              <span className="text-muted-foreground">TikTok ($1.8k)</span>
            </div>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
              <span className="h-1 w-3 rounded-full bg-emerald-500" />
              <span>Revenue ($18.4k)</span>
            </div>
          </div>
        </div>

        {/* SVG Visualization */}
        <div className="relative mt-6 h-[300px] w-full">
          {/* Y Axis labels */}
          <div className="absolute bottom-6 left-0 top-0 flex w-10 flex-col justify-between text-right text-[11px] font-medium text-muted-foreground">
            <span>$80k</span>
            <span>$60k</span>
            <span>$40k</span>
            <span>$20k</span>
            <span>$0</span>
          </div>

          {/* Chart Canvas Area */}
          <div className="absolute bottom-6 left-12 right-2 top-2">
            <svg
              className="h-full w-full overflow-visible"
              preserveAspectRatio="none"
              viewBox="0 0 1000 300"
            >
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="0" y1="0" x2="1000" y2="0" stroke="currentColor" strokeOpacity="0.08" />
              <line x1="0" y1="75" x2="1000" y2="75" stroke="currentColor" strokeOpacity="0.08" />
              <line x1="0" y1="150" x2="1000" y2="150" stroke="currentColor" strokeOpacity="0.08" />
              <line x1="0" y1="225" x2="1000" y2="225" stroke="currentColor" strokeOpacity="0.08" />
              <line x1="0" y1="300" x2="1000" y2="300" stroke="currentColor" strokeOpacity="0.15" />

              {/* TikTok Area (Purple) */}
              <path
                d="M0,285 Q200,260 400,220 T800,140 L800,300 L0,300 Z"
                fill="#a855f7"
                opacity="0.35"
              />

              {/* Google Area (Amber) */}
              <path
                d="M0,290 Q200,275 400,245 T800,185 L800,300 L0,300 Z"
                fill="#fbbf24"
                opacity="0.5"
              />

              {/* Meta Area (Blue) */}
              <path
                d="M0,295 Q200,285 400,265 T800,225 L800,300 L0,300 Z"
                fill="#3b82f6"
                opacity="0.75"
              />

              {/* Revenue Area fill & line */}
              <path
                d="M0,298 Q200,260 400,210 T800,65 L800,300 L0,300 Z"
                fill="url(#revGrad)"
              />
              <path
                d="M0,298 Q200,260 400,210 T800,65 T1000,15"
                fill="none"
                stroke="#10b981"
                strokeWidth="3.5"
                strokeLinecap="round"
              />

              {/* Live WebSocket pulsing point */}
              <circle cx="800" cy="65" r="5" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
              <line
                x1="800"
                y1="0"
                x2="800"
                y2="300"
                stroke="#94a3b8"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            </svg>

            {/* Interactive Live Tooltip (Simulated around the current 2:45 PM mark) */}
            {activeTooltip && (
              <div className="absolute left-[78%] top-[18%] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card/95 p-3.5 shadow-xl backdrop-blur-md">
                <div className="flex items-center justify-between gap-3 border-b border-border pb-1.5 text-xs font-bold">
                  <span className="text-foreground">2:45 PM (Live)</span>
                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600">
                    Active
                  </span>
                </div>
                <div className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between gap-4">
                    <span className="text-blue-500 font-medium">Meta Ads</span>
                    <span className="font-mono font-bold">$4,280</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-amber-500 font-medium">Google Ads</span>
                    <span className="font-mono font-bold">$3,150</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-purple-500 font-medium">TikTok Ads</span>
                    <span className="font-mono font-bold">$1,820</span>
                  </div>
                  <div className="border-t border-border pt-1.5 flex justify-between gap-4 font-bold text-emerald-600">
                    <span>Revenue</span>
                    <span className="font-mono">$18,400</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* X Axis labels */}
          <div className="absolute bottom-0 left-12 right-2 flex justify-between text-[11px] font-medium text-muted-foreground">
            <span>8:00 AM</span>
            <span>10:00 AM</span>
            <span>12:00 PM</span>
            <span>2:00 PM</span>
            <span>4:00 PM</span>
            <span>6:00 PM</span>
            <span>8:00 PM</span>
          </div>
        </div>
      </div>

      {/* Bottom Row: Live Feed (60%) & AI Copilot Proactive (40%) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Live Conversion Feed (3 cols on desktop) */}
        <div className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-3">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h3 className="text-base font-bold tracking-tight text-foreground">
                Live Conversion Feed
              </h3>
            </div>
            <span className="text-xs font-medium text-muted-foreground">Last 30 mins</span>
          </div>

          <div className="mt-3 divide-y divide-border/60 overflow-hidden">
            {SAMPLE_FEED.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-3 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                      item.platform === 'meta'
                        ? 'bg-blue-500/10 text-blue-600'
                        : item.platform === 'google'
                        ? 'bg-amber-500/10 text-amber-600'
                        : 'bg-purple-500/10 text-purple-600'
                    }`}
                  >
                    {item.platform === 'meta' ? 'M' : item.platform === 'google' ? 'G' : 'T'}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">
                      {item.email}{' '}
                      <span className="font-normal text-muted-foreground">{item.action}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.2 font-mono">
                        src: {item.platform}_ads
                      </span>
                      <span>•</span>
                      <span>cmp: {item.campaign}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={`font-mono text-xs font-bold ${
                      item.type === 'sale'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {item.amount}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{item.timeAgo}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Copilot Proactive Insights (2 cols on desktop) */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-purple-500/5 via-primary/5 to-indigo-500/10 p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary animate-pulse" />
              <h3 className="text-base font-bold tracking-tight text-foreground">
                AI Copilot Proactive
              </h3>
            </div>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
              High Confidence
            </span>
          </div>

          <div className="mt-4 rounded-xl border border-primary/20 bg-card/80 p-4 shadow-sm backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <Bot className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="text-xs leading-relaxed text-foreground">
                <span className="font-bold">Autonomous Opportunity Detected:</span> TikTok CPM
                dropped by <strong>22%</strong> over the last 4 hours while conversion rate surged to{' '}
                <strong>4.1%</strong>.
                <div className="mt-2 text-muted-foreground">
                  Reallocating $1,500 daily budget from Google Search to TikTok Retargeting is
                  projected to deliver <strong>+14 conversions</strong> ($3,360 incremental MRR).
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={copilotExecuted}
                onClick={handleCopilotAction}
                className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-bold transition-all ${
                  copilotExecuted
                    ? 'bg-emerald-500 text-white shadow'
                    : 'bg-primary text-primary-foreground shadow hover:opacity-90 active:scale-[0.98]'
                }`}
              >
                {copilotExecuted ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Budget Reallocated Successfully
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Execute 1-Click Rebalance
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-border bg-card/60 p-3">
              <div className="text-muted-foreground">Automated Saves</div>
              <div className="mt-1 font-mono font-bold text-foreground">$4,850 saved</div>
            </div>
            <div className="rounded-xl border border-border bg-card/60 p-3">
              <div className="text-muted-foreground">Guardrail Status</div>
              <div className="mt-1 font-semibold text-emerald-600">4 / 4 Active</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <MissingIntegrationOverlay
      orgId={orgId}
      projectId={projectId}
      isMissing={!isDataConnected}
      connectorId={missingConnectors[0] || 'stripe'}
      metricKey="ROI"
    >
      {dashboardContent}
    </MissingIntegrationOverlay>
  );
}
