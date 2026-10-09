'use client';

import React, { useState } from 'react';
import {
  ArrowRight,
  Layers,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type {
  CustomerExpansionSummary,
  CustomerExpansionEvent,
  AccountSegment,
} from '@growthos/shared';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';
import {
  PpCard,
  PpKpiGrid,
  PpKpiCard,
  PpEmptyState,
} from '@/components/pastel/primitives';

export interface ExpansionFeedItem {
  id: string;
  accountName: string;
  fromTier: string;
  toTier: string;
  mrrDelta: string;
  timeAgo: string;
  trigger: string;
  velocityScore?: number;
  movementType?: string;
  segment?: AccountSegment;
}

export interface ExpansionRadarProps {
  orgId?: string;
  projectId?: string;
  isDataConnected?: boolean;
  initialFeed?: ExpansionFeedItem[];
  initialTelemetry?: CustomerExpansionSummary;
}

const DEFAULT_TELEMETRY: CustomerExpansionSummary = {
  highExpansionPotentialCount: 248,
  potentialMrrLift: 38400,
  avgExpansionSpeedDays: 42,
  largeTeamAccountsCount: 86,
  upgradePenetrationRate: 34.2,
  tierDistribution: {
    free: 1240,
    starter: 1240,
    pro: 412,
    enterprise: 86,
  },
  recentEvents: [
    {
      id: 'exp-1',
      organizationId: 'demo-org',
      projectId: 'demo-project',
      customerId: 'cust-1',
      accountName: 'Vanguard Legal Partners',
      fromTier: 'Starter ($49)',
      toTier: 'Pro ($199)',
      previousMrr: 49,
      currentMrr: 199,
      mrrDelta: 150,
      movementType: 'expansion',
      direction: 'upgrade',
      segment: 'self_serve',
      velocityScore: 92,
      triggerReason: 'Added 4 extra paralegal seats',
      recordedAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
      timeAgo: '18 mins ago',
    },
    {
      id: 'exp-2',
      organizationId: 'demo-org',
      projectId: 'demo-project',
      customerId: 'cust-2',
      accountName: 'Northwest Real Estate LLC',
      fromTier: 'Pro ($199)',
      toTier: 'Enterprise ($650)',
      previousMrr: 199,
      currentMrr: 650,
      mrrDelta: 451,
      movementType: 'expansion',
      direction: 'upgrade',
      segment: 'enterprise',
      velocityScore: 95,
      triggerReason: 'Enabled SAML SSO and audit logs',
      recordedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      timeAgo: '2h ago',
    },
    {
      id: 'exp-3',
      organizationId: 'demo-org',
      projectId: 'demo-project',
      customerId: 'cust-3',
      accountName: 'Starlight Financial Inc',
      fromTier: 'Starter ($49)',
      toTier: 'Pro ($199)',
      previousMrr: 49,
      currentMrr: 199,
      mrrDelta: 150,
      movementType: 'expansion',
      direction: 'upgrade',
      segment: 'self_serve',
      velocityScore: 88,
      triggerReason: 'Hit 25 document/month limit',
      recordedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      timeAgo: '5h ago',
    },
    {
      id: 'exp-4',
      organizationId: 'demo-org',
      projectId: 'demo-project',
      customerId: 'cust-4',
      accountName: 'Apex Health Logistics',
      fromTier: 'Pro ($199)',
      toTier: 'Enterprise ($650)',
      previousMrr: 199,
      currentMrr: 650,
      mrrDelta: 451,
      movementType: 'expansion',
      direction: 'upgrade',
      segment: 'enterprise',
      velocityScore: 96,
      triggerReason: 'Custom compliance & dedicated IP',
      recordedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      timeAgo: 'Yesterday',
    },
  ],
};

export function ExpansionRadar({
  orgId = 'demo-org',
  projectId = 'demo-project',
  isDataConnected = true,
  initialFeed,
  initialTelemetry,
}: ExpansionRadarProps) {
  const [selectedSegment, setSelectedSegment] = useState<AccountSegment>('all');
  const telemetry = initialTelemetry || DEFAULT_TELEMETRY;

  // Derive feed from initialFeed if passed explicitly, else from telemetry events
  const rawEvents: Array<{
    id: string;
    accountName: string;
    fromTier: string;
    toTier: string;
    mrrDelta: string;
    timeAgo: string;
    trigger: string;
    velocityScore?: number;
    movementType?: string;
    segment?: AccountSegment;
  }> =
    initialFeed !== undefined
      ? initialFeed
      : telemetry.recentEvents.map((e) => ({
          id: e.id,
          accountName: e.accountName,
          fromTier: e.fromTier,
          toTier: e.toTier,
          mrrDelta: e.mrrDelta >= 0 ? `+$${e.mrrDelta}/mo` : `-$${Math.abs(e.mrrDelta)}/mo`,
          timeAgo: e.timeAgo || 'Recently',
          trigger: e.triggerReason,
          velocityScore: e.velocityScore,
          movementType: e.movementType,
          segment: e.segment,
        }));

  const filteredFeed = rawEvents.filter((item) => {
    if (selectedSegment === 'all') return true;
    return item.segment === selectedSegment;
  });

  const totalPaying =
    telemetry.tierDistribution.starter +
    telemetry.tierDistribution.pro +
    telemetry.tierDistribution.enterprise;

  const content = (
    <div className="space-y-8" data-testid="expansion-radar">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-label-sm text-label-sm text-pp-outline">
            <span>GrowthOS</span>
            <span>&gt;</span>
            <span className="text-pp-on-surface">Expansion Intelligence</span>
          </div>
          <h1 className="mt-1 font-pp-display text-pp-headline-xl-mobile font-bold tracking-tight text-pp-on-surface sm:text-pp-headline-xl">
            Account Size Distribution & Upgrade Expansion Potential
          </h1>
          <p className="mt-0.5 text-pp-body-sm text-pp-on-surface-variant">
            Autonomous detection of accounts ready for seat expansion, plan tier upsell, and enterprise migration.
          </p>
        </div>

        {/* Segment Switcher */}
        <div className="inline-flex rounded-full border border-pp-outline-variant/60 bg-pp-surface-container-low p-1 shadow-2xs">
          <button
            type="button"
            onClick={() => setSelectedSegment('all')}
            className={`rounded-full px-3.5 py-1.5 font-pp-label-sm text-pp-label-sm font-semibold transition-all ${
              selectedSegment === 'all'
                ? 'bg-primary bg-pp-primary text-pp-on-primary shadow-xs'
                : 'text-pp-on-surface-variant hover:text-pp-on-surface'
            }`}
          >
            All Accounts
          </button>
          <button
            type="button"
            onClick={() => setSelectedSegment('self_serve')}
            className={`rounded-full px-3.5 py-1.5 font-pp-label-sm text-pp-label-sm font-semibold transition-all ${
              selectedSegment === 'self_serve'
                ? 'bg-primary bg-pp-primary text-pp-on-primary shadow-xs'
                : 'text-pp-on-surface-variant hover:text-pp-on-surface'
            }`}
          >
            Self-Serve Upgrades
          </button>
          <button
            type="button"
            onClick={() => setSelectedSegment('enterprise')}
            className={`rounded-full px-3.5 py-1.5 font-pp-label-sm text-pp-label-sm font-semibold transition-all ${
              selectedSegment === 'enterprise'
                ? 'bg-primary bg-pp-primary text-pp-on-primary shadow-xs'
                : 'text-pp-on-surface-variant hover:text-pp-on-surface'
            }`}
          >
            High-Potential Enterprise
          </button>
        </div>
      </div>

      {/* 4 Expansion Scorecards */}
      <PpKpiGrid>
        <PpKpiCard
          label="High Expansion Potential"
          value={String(telemetry.highExpansionPotentialCount)}
          valueSuffix="Accounts"
          accent="primary"
          badge="Score > 85"
          badgeAccent="primary"
          footer={`+$${telemetry.potentialMrrLift.toLocaleString()} potential MRR lift`}
        />

        <PpKpiCard
          label="Average Expansion Speed"
          value={String(telemetry.avgExpansionSpeedDays)}
          valueSuffix="Days"
          accent="mint"
          badge="Velocity"
          badgeAccent="mint"
          footer="1st payment to 1st seat upgrade"
        />

        <PpKpiCard
          label="Large Team Accounts"
          value={String(telemetry.largeTeamAccountsCount)}
          valueSuffix=">100 seats"
          accent="amber"
          badge="Avg $1,240/mo"
          badgeAccent="amber"
          footer="Enterprise density tier"
        />

        <PpKpiCard
          label="Upgrade Penetration"
          value={`${telemetry.upgradePenetrationRate}%`}
          accent="mint"
          badge="HIGH"
          badgeAccent="mint"
          progress={telemetry.upgradePenetrationRate}
          footer="12-month upgrade rate from signup"
        />
      </PpKpiGrid>

      {/* Plan Tier Migration Flow & Live Feed Container */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Tier Migration Waterfall (Col Span 2) */}
        <PpCard
          title="Plan Tier Migration Waterfall"
          subtitle="Net account migrations, seat accumulation velocities, and monthly run-rate expansion"
          className="lg:col-span-2"
          action={
            <span className="rounded-full bg-pp-primary/10 px-2.5 py-0.5 font-pp-label-sm text-pp-label-sm font-bold text-pp-primary">
              {totalPaying.toLocaleString()} Total Paying
            </span>
          }
        >
          {/* Waterfall Columns */}
          <div className="grid grid-cols-4 gap-4 items-end h-56 mt-4">
            {/* Free Trial */}
            <div className="flex flex-col items-center justify-end h-full">
              <div className="w-full rounded-2xl bg-pp-surface-container-low p-3 text-center transition-all hover:bg-pp-surface-container h-[90%] flex flex-col justify-between border border-pp-outline-variant/30">
                <span className="font-pp-label-sm text-[10px] font-bold uppercase text-pp-outline">Free Trial</span>
                <div>
                  <div className="font-pp-display text-lg font-bold text-pp-on-surface">
                    {telemetry.tierDistribution.free.toLocaleString()}
                  </div>
                  <span className="font-pp-body-sm text-[10px] text-pp-outline">Accounts</span>
                </div>
              </div>
            </div>

            {/* Starter */}
            <div className="flex flex-col items-center justify-end h-full">
              <div className="w-full rounded-2xl bg-purple-500/10 border border-purple-500/20 p-3 text-center transition-all hover:bg-purple-500/15 h-[70%] flex flex-col justify-between">
                <span className="font-pp-label-sm text-[10px] font-bold uppercase text-purple-700 dark:text-purple-300">Starter ($49)</span>
                <div>
                  <div className="font-pp-display text-lg font-bold text-pp-on-surface">
                    {telemetry.tierDistribution.starter.toLocaleString()}
                  </div>
                  <span className="font-pp-body-sm text-[10px] text-pp-outline">Accounts</span>
                </div>
              </div>
            </div>

            {/* Pro */}
            <div className="flex flex-col items-center justify-end h-full">
              <div className="w-full rounded-2xl bg-pp-primary-fixed/30 border border-pp-primary/30 p-3 text-center transition-all hover:bg-pp-primary-fixed/40 h-[45%] flex flex-col justify-between">
                <span className="font-pp-label-sm text-[10px] font-bold uppercase text-pp-primary">Pro ($199)</span>
                <div>
                  <div className="font-pp-display text-lg font-bold text-pp-on-surface">
                    {telemetry.tierDistribution.pro.toLocaleString()}
                  </div>
                  <span className="font-pp-body-sm text-[10px] text-pp-outline">Accounts</span>
                </div>
              </div>
            </div>

            {/* Enterprise */}
            <div className="flex flex-col items-center justify-end h-full">
              <div className="w-full rounded-2xl bg-pp-primary text-pp-on-primary p-3 text-center shadow-pp-candy h-[25%] flex flex-col justify-between">
                <span className="font-pp-label-sm text-[10px] font-bold uppercase opacity-90">Enterprise ($650)</span>
                <div>
                  <div className="font-pp-display text-lg font-bold">
                    {telemetry.tierDistribution.enterprise.toLocaleString()}
                  </div>
                  <span className="font-pp-body-sm text-[10px] opacity-80">Accounts</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-pp-outline-variant/30 pt-4 font-pp-body-sm text-pp-body-sm text-pp-on-surface-variant flex items-center justify-between">
            <span>Key Trigger: Additional team seats & SAML SSO configuration</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">+24.5% Expansion MRR vs last month</span>
          </div>
        </PpCard>

        {/* Live Expansion Feed (Col Span 1) */}
        <PpCard
          title="Recent Upgrades Feed"
          subtitle="Real-time upgrade notifications"
          action={
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          }
        >
          {filteredFeed.length === 0 ? (
            <div className="py-6">
              <PpEmptyState
                icon={Layers}
                title="No recent upgrades"
                description="Live plan tier upgrades and seat expansion events will stream in as billing webhooks arrive."
              />
            </div>
          ) : (
            <div className="divide-y divide-pp-outline-variant/30">
              {filteredFeed.map((item) => (
                <div key={item.id} className="py-3 transition-colors hover:bg-pp-surface-container-low/40">
                  <div className="flex items-start justify-between">
                    <span className="font-pp-label-md text-pp-label-md font-bold text-pp-on-surface">{item.accountName}</span>
                    <span className="text-[10px] text-pp-outline">{item.timeAgo}</span>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-pp-surface-container px-2 py-0.5 font-pp-label-sm text-[11px] text-pp-on-surface-variant">
                        {item.fromTier}
                      </span>
                      <ArrowRight className="h-3 w-3 text-pp-outline rtl:rotate-180" />
                      <span className="rounded-full bg-pp-primary-fixed px-2 py-0.5 font-pp-label-sm text-[11px] font-bold text-pp-on-primary-fixed-variant">
                        {item.toTier}
                      </span>
                    </div>
                    {item.velocityScore && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        Score {item.velocityScore}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="text-pp-on-surface-variant truncate max-w-[180px]">
                      {item.trigger}
                    </span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {item.mrrDelta}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PpCard>
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
