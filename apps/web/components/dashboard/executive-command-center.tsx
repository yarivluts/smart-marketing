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
import {
  PpPageHeader,
  PpCard,
  PpKpiCard,
  PpKpiGrid,
  PpEmptyState,
  PpPill,
  PpButton,
} from '@/components/pastel/primitives';

export interface ExecutiveCommandCenterProps {
  orgId?: string;
  projectId?: string;
  projectName?: string;
  isDataConnected?: boolean;
  missingConnectors?: string[];
  onExecuteCopilotAction?: () => void;
  feedItems?: ConversionFeedItem[];
}

export type TimeWindow = 'today' | 'yesterday' | '7d';
export type AttributionModel = 'shapley' | 'first_touch' | 'last_touch' | 'linear';

export interface ConversionFeedItem {
  id: string;
  email: string;
  action: string;
  platform: 'meta' | 'google' | 'tiktok';
  campaign: string;
  timeAgo: string;
  amount: string;
  type: 'sale' | 'lead' | 'trial';
}

export function ExecutiveCommandCenter({
  orgId = 'demo-org',
  projectId = 'demo-project',
  projectName = 'Acme Growth SaaS',
  isDataConnected = true,
  missingConnectors = [],
  onExecuteCopilotAction,
  feedItems = [],
}: ExecutiveCommandCenterProps): React.ReactElement {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('today');
  const [attribution, setAttribution] = useState<AttributionModel>('shapley');
  const [copilotExecuted, setCopilotExecuted] = useState<boolean>(false);

  const handleCopilotAction = () => {
    setCopilotExecuted(true);
    onExecuteCopilotAction?.();
  };

  const dashboardContent = (
    <div className="space-y-pp-lg text-pp-on-surface" data-testid="executive-command-center">
      {/* Top Header & Interactive Filter Bar */}
      <PpPageHeader
        eyebrow="GROWTH TELEMETRY ENGINE"
        meta={
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pp-secondary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-pp-secondary" />
            </span>
            <span>Live 60s Stream • {projectName}</span>
          </span>
        }
        title={
          <span className="flex items-center gap-2">
            <span>Executive Command Center</span>
            <PageGuideButton pageKey="pulse" />
          </span>
        }
        description="Real-time cross-channel performance, revenue pacing, and autonomous growth guardrails."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {/* Time Window Buttons */}
            <div className="inline-flex rounded-full bg-pp-surface-container p-1 shadow-xs">
              <button
                type="button"
                onClick={() => setTimeWindow('today')}
                className={`rounded-full px-3.5 py-1 text-pp-label-sm font-semibold transition-all ${
                  timeWindow === 'today'
                    ? 'bg-pp-primary text-pp-on-primary shadow-xs'
                    : 'text-pp-on-surface-variant hover:text-pp-on-surface'
                }`}
              >
                Today (Live)
              </button>
              <button
                type="button"
                onClick={() => setTimeWindow('yesterday')}
                className={`rounded-full px-3.5 py-1 text-pp-label-sm font-semibold transition-all ${
                  timeWindow === 'yesterday'
                    ? 'bg-pp-primary text-pp-on-primary shadow-xs'
                    : 'text-pp-on-surface-variant hover:text-pp-on-surface'
                }`}
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => setTimeWindow('7d')}
                className={`rounded-full px-3.5 py-1 text-pp-label-sm font-semibold transition-all ${
                  timeWindow === '7d'
                    ? 'bg-pp-primary text-pp-on-primary shadow-xs'
                    : 'text-pp-on-surface-variant hover:text-pp-on-surface'
                }`}
              >
                7 Days
              </button>
            </div>

            {/* Attribution Dropdown */}
            <div className="inline-flex items-center gap-1.5 rounded-full bg-pp-surface-container px-3 py-1.5 text-pp-label-sm font-medium">
              <span className="text-pp-outline">Attribution:</span>
              <select
                value={attribution}
                onChange={(e) => setAttribution(e.target.value as AttributionModel)}
                className="bg-transparent font-semibold text-pp-on-surface focus:outline-none"
                aria-label="Attribution Model"
              >
                <option value="shapley">Data-Driven (Shapley)</option>
                <option value="first_touch">First Touch</option>
                <option value="last_touch">Last Touch</option>
                <option value="linear">Linear Multi-Touch</option>
              </select>
            </div>
          </div>
        }
      />

      {/* 4 Executive KPI Scorecards */}
      <PpKpiGrid>
        <PpKpiCard
          label="Total Blended Spend"
          value={isDataConnected ? '$0' : '—'}
          valueSuffix={isDataConnected ? 'USD' : undefined}
          accent="primary"
          badge={isDataConnected ? 'Live' : 'Pending Ingestion'}
          badgeAccent={isDataConnected ? 'primary' : 'neutral'}
          footer="Blended ad network expenditure across Google, Meta, and TikTok"
        />

        <PpKpiCard
          label="Blended ROAS"
          value={isDataConnected ? '0.0x' : '—'}
          accent="mint"
          badge="Target 2.80x"
          badgeAccent="mint"
          footer="Target efficiency pacing threshold"
        />

        <PpKpiCard
          label="Marketing Efficiency (MER)"
          value={isDataConnected ? '0.0%' : '—'}
          accent="sky"
          badge="Target: 30%"
          badgeAccent="sky"
          footer="Total ad spend divided by gross inflow revenue"
        />

        <PpKpiCard
          label="Net Contribution Margin"
          value={isDataConnected ? '$0' : '—'}
          accent="pink"
          badge="Net Profit"
          badgeAccent="pink"
          footer="Realized revenue minus blended media costs"
        />
      </PpKpiGrid>

      {/* Main Intraday Pacing Chart Canvas */}
      <PpCard
        title="Revenue Velocity vs. Omni-Spend"
        subtitle="Continuous telemetry tracking dynamic ROAS across active cohorts"
        action={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 rounded-full bg-pp-surface-container px-3 py-1 text-pp-label-sm font-semibold">
              <span className="flex items-center gap-1.5 text-pp-on-surface">
                <span className="h-2 w-2 rounded-full bg-pp-primary" />
                ARR Inflow
              </span>
              <span className="flex items-center gap-1.5 text-pp-on-surface-variant">
                <span className="h-2 w-2 rounded-full bg-pp-tertiary-fixed-dim" />
                Blended Spend
              </span>
            </div>
            <PpPill accent="mint" dot>
              Live Telemetry
            </PpPill>
          </div>
        }
      >
        <div className="relative mt-2 h-64 w-full">
          {/* Y Axis labels */}
          <div className="absolute bottom-6 start-0 top-0 flex w-12 flex-col justify-between text-end text-pp-label-sm text-pp-outline">
            <span>$50k</span>
            <span>$35k</span>
            <span>$20k</span>
            <span>$5k</span>
            <span>$0</span>
          </div>

          {/* Chart Canvas Area */}
          <div className="absolute bottom-6 end-2 start-14 top-2">
            <svg
              className="h-full w-full overflow-visible"
              preserveAspectRatio="none"
              viewBox="0 0 1000 200"
            >
              <defs>
                <linearGradient id="primaryCurveGrad" x1="0%" x2="0%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="#5243d5" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#5243d5" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="spendCurveGrad" x1="0%" x2="0%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="#ffade2" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#ffade2" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="0" y1="0" x2="1000" y2="0" stroke="#c8c4d7" strokeOpacity="0.3" strokeDasharray="3 3" />
              <line x1="0" y1="50" x2="1000" y2="50" stroke="#c8c4d7" strokeOpacity="0.3" strokeDasharray="3 3" />
              <line x1="0" y1="100" x2="1000" y2="100" stroke="#c8c4d7" strokeOpacity="0.3" strokeDasharray="3 3" />
              <line x1="0" y1="150" x2="1000" y2="150" stroke="#c8c4d7" strokeOpacity="0.3" strokeDasharray="3 3" />
              <line x1="0" y1="200" x2="1000" y2="200" stroke="#c8c4d7" strokeOpacity="0.5" />

              {/* Spend Curve */}
              <path
                d="M 0 170 C 200 160, 400 145, 600 135 C 800 120, 900 105, 1000 95 L 1000 200 L 0 200 Z"
                fill="url(#spendCurveGrad)"
              />
              <path
                d="M 0 170 C 200 160, 400 145, 600 135 C 800 120, 900 105, 1000 95"
                fill="none"
                stroke="#ffade2"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Revenue Inflow Curve */}
              <path
                d="M 0 185 C 200 165, 400 130, 600 80 C 800 50, 900 30, 1000 15 L 1000 200 L 0 200 Z"
                fill="url(#primaryCurveGrad)"
              />
              <path
                d="M 0 185 C 200 165, 400 130, 600 80 C 800 50, 900 30, 1000 15"
                fill="none"
                stroke="#5243d5"
                strokeWidth="3"
                strokeLinecap="round"
              />

              {/* Active Pulse Node */}
              <circle cx="850" cy="42" r="5" fill="#ffffff" stroke="#5243d5" strokeWidth="3" className="animate-pulse" />
            </svg>
          </div>

          {/* X Axis labels */}
          <div className="absolute bottom-0 end-2 start-14 flex justify-between text-pp-label-sm text-pp-outline">
            <span>Oct 01</span>
            <span>Oct 06</span>
            <span>Oct 12</span>
            <span>Oct 18</span>
            <span>Oct 24</span>
            <span>Today (Live)</span>
          </div>
        </div>
      </PpCard>

      {/* Lower Section: Live Conversion Feed (3 cols) & AI Copilot (2 cols) */}
      <div className="grid grid-cols-1 gap-pp-lg lg:grid-cols-5">
        {/* Live Conversion Feed */}
        <PpCard
          title="Live Conversion Feed"
          subtitle="Last 30 mins"
          icon={Activity}
          iconAccent="primary"
          className="lg:col-span-3"
        >
          {feedItems.length === 0 ? (
            <PpEmptyState
              icon={Activity}
              title="No Live Conversions Recorded Yet"
              description="Connect your payment gateway and advertising streams to monitor live transaction telemetry in real time."
            />
          ) : (
            <div className="divide-y divide-pp-surface-container overflow-hidden">
              {feedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-3 transition-colors hover:bg-pp-surface-container-low/60"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                        item.platform === 'meta'
                          ? 'bg-blue-100 text-blue-700'
                          : item.platform === 'google'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-pp-tertiary-fixed text-pp-on-tertiary-fixed'
                      }`}
                    >
                      {item.platform === 'meta' ? 'M' : item.platform === 'google' ? 'G' : 'T'}
                    </div>
                    <div>
                      <div className="text-pp-body-md font-semibold text-pp-on-surface">
                        {item.email}{' '}
                        <span className="font-normal text-pp-on-surface-variant">{item.action}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-pp-label-sm text-pp-outline">
                        <span className="rounded bg-pp-surface-container px-1.5 py-0.5 font-mono">
                          src: {item.platform}_ads
                        </span>
                        <span>•</span>
                        <span>cmp: {item.campaign}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-end">
                    <div
                      className={`font-mono text-pp-body-md font-bold ${
                        item.type === 'sale'
                          ? 'text-pp-secondary'
                          : 'text-pp-on-surface-variant'
                      }`}
                    >
                      {item.amount}
                    </div>
                    <div className="text-pp-label-sm text-pp-outline">{item.timeAgo}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PpCard>

        {/* AI Copilot Proactive Insights */}
        <PpCard
          title="Growth Copilot"
          subtitle="Real-time Anomaly Engine"
          icon={Sparkles}
          iconAccent="primary"
          action={
            <PpPill accent="mint" dot>
              AI Active
            </PpPill>
          }
          className="lg:col-span-2"
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-pp-outline-variant/30 bg-pp-surface-container-low p-4">
              <div className="flex items-start gap-3">
                <Bot className="mt-0.5 h-5 w-5 shrink-0 text-pp-primary" />
                <div className="text-pp-body-sm leading-relaxed text-pp-on-surface">
                  <span className="font-bold">Autonomous Opportunity Detected:</span> TikTok CPM
                  dropped by <strong>22%</strong> while conversion rate stabilized at{' '}
                  <strong>4.1%</strong>.
                  <div className="mt-2 text-pp-on-surface-variant">
                    Reallocating $1,500 daily budget from Google Search to TikTok Retargeting is
                    projected to deliver <strong>+14 conversions</strong>.
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-pp-outline-variant/30">
                <PpButton
                  type="button"
                  variant={copilotExecuted ? 'secondary' : 'primary'}
                  disabled={copilotExecuted}
                  onClick={handleCopilotAction}
                  className="w-full"
                  icon={copilotExecuted ? CheckCircle2 : Zap}
                >
                  {copilotExecuted
                    ? 'Budget Reallocated Successfully'
                    : 'Execute 1-Click Rebalance'}
                </PpButton>
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-3 text-pp-body-sm">
              <div className="rounded-2xl bg-pp-surface-container-low p-3">
                <div className="text-pp-label-sm uppercase text-pp-outline">Automated Saves</div>
                <div className="mt-1 font-mono font-bold text-pp-on-surface">$0 saved</div>
              </div>
              <div className="rounded-2xl bg-pp-surface-container-low p-3">
                <div className="text-pp-label-sm uppercase text-pp-outline">Guardrail Status</div>
                <div className="mt-1 font-semibold text-pp-secondary">4 / 4 Active</div>
              </div>
            </div>
          </div>
        </PpCard>
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
