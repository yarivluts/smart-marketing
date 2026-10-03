'use client';

import React, { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Clock,
  Layers,
  Users,
} from 'lucide-react';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';

export interface ExpansionFeedItem {
  id: string;
  accountName: string;
  fromTier: string;
  toTier: string;
  mrrDelta: string;
  timeAgo: string;
  trigger: string;
}

export interface ExpansionRadarProps {
  orgId?: string;
  projectId?: string;
  isDataConnected?: boolean;
  initialFeed?: ExpansionFeedItem[];
}

const DEFAULT_FEED: ExpansionFeedItem[] = [
  {
    id: 'exp-1',
    accountName: 'Vanguard Legal Partners',
    fromTier: 'Starter ($49)',
    toTier: 'Pro ($199)',
    mrrDelta: '+$150/mo',
    timeAgo: '18 mins ago',
    trigger: 'Added 4 extra paralegal seats',
  },
  {
    id: 'exp-2',
    accountName: 'Northwest Real Estate LLC',
    fromTier: 'Pro ($199)',
    toTier: 'Enterprise ($650)',
    mrrDelta: '+$451/mo',
    timeAgo: '2h ago',
    trigger: 'Enabled SAML SSO and audit logs',
  },
  {
    id: 'exp-3',
    accountName: 'Starlight Financial Inc',
    fromTier: 'Starter ($49)',
    toTier: 'Pro ($199)',
    mrrDelta: '+$150/mo',
    timeAgo: '5h ago',
    trigger: 'Hit 25 document/month limit',
  },
  {
    id: 'exp-4',
    accountName: 'Apex Health Logistics',
    fromTier: 'Pro ($199)',
    toTier: 'Enterprise ($650)',
    mrrDelta: '+$451/mo',
    timeAgo: 'Yesterday',
    trigger: 'Custom compliance & dedicated IP',
  },
];

export function ExpansionRadar({
  orgId = 'demo-org',
  projectId = 'demo-project',
  isDataConnected = true,
  initialFeed,
}: ExpansionRadarProps) {
  const [feed, setFeed] = useState<ExpansionFeedItem[]>(initialFeed && initialFeed.length > 0 ? initialFeed : DEFAULT_FEED);
  const [selectedSegment, setSelectedSegment] = useState<'all' | 'self_serve' | 'enterprise'>('all');

  const content = (
    <div className="space-y-8" data-testid="expansion-radar">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>GrowthOS</span>
            <span>&gt;</span>
            <span className="text-foreground">Expansion Intelligence</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Account Size Distribution & Upgrade Expansion Potential
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            Autonomous detection of accounts ready for seat expansion, plan tier upsell, and enterprise migration.
          </p>
        </div>

        {/* Segment Switcher */}
        <div className="inline-flex rounded-xl border border-border bg-card p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setSelectedSegment('all')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              selectedSegment === 'all'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All Accounts
          </button>
          <button
            type="button"
            onClick={() => setSelectedSegment('self_serve')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              selectedSegment === 'self_serve'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Self-Serve Upgrades
          </button>
          <button
            type="button"
            onClick={() => setSelectedSegment('enterprise')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              selectedSegment === 'enterprise'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            High-Potential Enterprise
          </button>
        </div>
      </div>

      {/* 4 Expansion Scorecards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1 */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                High Expansion Potential
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold tracking-tight text-foreground">248</span>
              <span className="text-xs text-muted-foreground">Accounts</span>
            </div>
          </div>
          <div className="mt-4 border-t border-border pt-3 text-xs font-semibold text-emerald-600 flex items-center gap-1">
            <ArrowUpRight className="h-3.5 w-3.5" />
            +$38,400 potential MRR lift
          </div>
        </div>

        {/* Card 2 */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Average Expansion Speed
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold tracking-tight text-foreground">42</span>
              <span className="text-xs text-muted-foreground">Days</span>
            </div>
          </div>
          <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            1st payment to 1st seat upgrade
          </div>
        </div>

        {/* Card 3 */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Large Team Accounts
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold tracking-tight text-foreground">86</span>
              <span className="text-xs text-muted-foreground">&gt;100 seats</span>
            </div>
          </div>
          <div className="mt-4 border-t border-border pt-3 text-xs font-semibold text-foreground">
            Avg MRR: $1,240 / mo
          </div>
        </div>

        {/* Card 4 */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Upgrade Penetration
              </span>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                HIGH
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold tracking-tight text-foreground">34.2%</span>
            </div>
          </div>
          <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            12-month upgrade rate from signup
          </div>
        </div>
      </div>

      {/* Plan Tier Migration Flow & Live Feed Container */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Tier Migration Waterfall (Col Span 2) */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm lg:col-span-2">
          <div>
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h2 className="text-base font-bold tracking-tight text-foreground">
                  Plan Tier Migration Waterfall
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Active account distribution across Starter ➔ Pro ➔ Enterprise tiers.
                </p>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                1,738 Total Paying
              </span>
            </div>

            {/* Waterfall Columns */}
            <div className="mt-8 grid grid-cols-4 gap-4 items-end h-56">
              {/* Free Trial */}
              <div className="flex flex-col items-center justify-end h-full">
                <div className="w-full rounded-xl bg-muted/60 p-3 text-center transition-all hover:bg-muted h-[90%] flex flex-col justify-between">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">Free Trial</span>
                  <div>
                    <div className="text-lg font-bold text-foreground">1,240</div>
                    <span className="text-[10px] text-muted-foreground">Accounts</span>
                  </div>
                </div>
              </div>

              {/* Starter */}
              <div className="flex flex-col items-center justify-end h-full">
                <div className="w-full rounded-xl bg-purple-500/15 border border-purple-500/30 p-3 text-center transition-all hover:bg-purple-500/20 h-[70%] flex flex-col justify-between">
                  <span className="text-[10px] font-bold uppercase text-purple-600">Starter ($49)</span>
                  <div>
                    <div className="text-lg font-bold text-foreground">1,240</div>
                    <span className="text-[10px] text-muted-foreground">Accounts</span>
                  </div>
                </div>
              </div>

              {/* Pro */}
              <div className="flex flex-col items-center justify-end h-full">
                <div className="w-full rounded-xl bg-primary/20 border border-primary/40 p-3 text-center transition-all hover:bg-primary/25 h-[45%] flex flex-col justify-between">
                  <span className="text-[10px] font-bold uppercase text-primary">Pro ($199)</span>
                  <div>
                    <div className="text-lg font-bold text-foreground">412</div>
                    <span className="text-[10px] text-muted-foreground">Accounts</span>
                  </div>
                </div>
              </div>

              {/* Enterprise */}
              <div className="flex flex-col items-center justify-end h-full">
                <div className="w-full rounded-xl bg-primary text-primary-foreground p-3 text-center shadow-md h-[25%] flex flex-col justify-between">
                  <span className="text-[10px] font-bold uppercase opacity-90">Enterprise ($650)</span>
                  <div>
                    <div className="text-lg font-bold">86</div>
                    <span className="text-[10px] opacity-80">Accounts</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground flex items-center justify-between">
            <span>Key Trigger: Additional team seats & SAML SSO configuration</span>
            <span className="font-semibold text-emerald-600">+24.5% Expansion MRR vs last month</span>
          </div>
        </div>

        {/* Live Expansion Feed (Col Span 1) */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <h2 className="text-base font-bold tracking-tight text-foreground">
                Recent Upgrades Feed
              </h2>
            </div>
            <span className="text-xs text-muted-foreground">Real-time</span>
          </div>

          <div className="divide-y divide-border/60">
            {feed.map((item) => (
              <div key={item.id} className="p-4 transition-colors hover:bg-muted/40">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-bold text-foreground">{item.accountName}</span>
                  <span className="text-[10px] text-muted-foreground">{item.timeAgo}</span>
                </div>

                <div className="mt-1.5 flex items-center gap-2 text-xs">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {item.fromTier}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">
                    {item.toTier}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground truncate max-w-[180px]">
                    {item.trigger}
                  </span>
                  <span className="font-mono font-bold text-emerald-600">
                    {item.mrrDelta}
                  </span>
                </div>
              </div>
            ))}
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
      connectorId="stripe"
      metricKey="MRR_WATERFALL"
    >
      {content}
    </MissingIntegrationOverlay>
  );
}
