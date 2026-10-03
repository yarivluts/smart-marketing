'use client';

import React, { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';
import {
  PpCard,
  PpKpiGrid,
  PpKpiCard,
  PpEmptyState,
  ppInputClass,
} from '@/components/pastel/primitives';

export interface PeerBenchmarksHubProps {
  orgId?: string;
  projectId?: string;
  isDataConnected?: boolean;
}

export function PeerBenchmarksHub({
  orgId = 'demo-org',
  projectId = 'demo-project',
  isDataConnected = true,
}: PeerBenchmarksHubProps) {
  const [industry, setIndustry] = useState('b2b_saas');
  const [cohortComparison, setCohortComparison] = useState('all');

  const hubContent = (
    <div className="space-y-8" data-testid="peer-benchmarks-hub">
      {/* Title & Breadcrumbs */}
      <div>
        <div className="flex items-center gap-2 font-label-sm text-label-sm text-pp-outline">
          <span>GrowthOS</span>
          <span>&gt;</span>
          <span className="text-pp-on-surface">Market Intelligence</span>
        </div>
        <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
          <h1 className="font-pp-display text-pp-headline-xl-mobile font-bold tracking-tight text-pp-on-surface sm:text-pp-headline-xl">
            Dynamic Peer Benchmarks
          </h1>
          <span className="font-pp-label-sm text-sm font-medium text-pp-outline">
            (20,000+ Active Brands Like Yours)
          </span>
        </div>
        <p className="mt-1 font-pp-body-sm text-pp-body-sm text-pp-on-surface-variant">
          Real-time algorithmic comparison against verified merchant cohorts across blended ad spend, CAC velocity, and retention.
        </p>
      </div>

      {/* Cohort Filter Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className={`rounded-full px-4 py-2 font-pp-label-sm text-xs font-semibold ${ppInputClass}`}
        >
          <option value="b2b_saas">Industry: B2B SaaS & Productivity</option>
          <option value="ecommerce">Industry: Direct-to-Consumer & Retail</option>
          <option value="fintech">Industry: FinTech & Payments</option>
        </select>

        <div className="rounded-full border border-pp-outline-variant/60 bg-pp-surface-container-low px-4 py-2 font-pp-label-sm text-xs font-medium text-pp-on-surface-variant shadow-2xs">
          Spend: <strong className="text-pp-on-surface">$50k - $150k / mo</strong>
        </div>

        <div className="rounded-full border border-pp-outline-variant/60 bg-pp-surface-container-low px-4 py-2 font-pp-label-sm text-xs font-medium text-pp-on-surface-variant shadow-2xs">
          Region: <strong className="text-pp-on-surface">Global</strong>
        </div>

        <div className="ms-auto flex items-center gap-2">
          <span className="font-pp-label-sm text-xs font-medium text-pp-outline">Compare Against:</span>
          <select
            value={cohortComparison}
            onChange={(e) => setCohortComparison(e.target.value)}
            className={`rounded-full px-3.5 py-2 font-pp-label-sm text-xs font-bold ${ppInputClass}`}
          >
            <option value="all">All B2B SaaS Cohorts</option>
            <option value="top10">Top 10% Performers</option>
            <option value="direct">Direct Competitors</option>
          </select>
        </div>
      </div>

      {/* 4 Core Benchmark Scorecards */}
      <PpKpiGrid>
        <PpKpiCard
          label="Sales Return"
          value="—"
          valueSuffix="(for every $1 spent)"
          accent="primary"
          badge="Standby"
          badgeAccent="neutral"
          footer="Awaiting aggregated peer benchmark dataset"
        />

        <PpKpiCard
          label="Cost to Get a Customer"
          value="—"
          valueSuffix="Blended CAC"
          accent="mint"
          badge="Standby"
          badgeAccent="neutral"
          footer="Awaiting aggregated peer benchmark dataset"
        />

        <PpKpiCard
          label="Landing Page Success Rate"
          value="—"
          valueSuffix="Visitor to Lead"
          accent="sky"
          badge="Standby"
          badgeAccent="neutral"
          footer="Awaiting aggregated peer benchmark dataset"
        />

        <PpKpiCard
          label="Ad Click-Through Rate"
          value="—"
          valueSuffix="Blended CTR"
          accent="primary"
          badge="Standby"
          badgeAccent="neutral"
          footer="Awaiting aggregated peer benchmark dataset"
        />
      </PpKpiGrid>

      {/* Distribution Curves & Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Widget 1: ROAS Distribution */}
        <PpCard
          title="ROAS Distribution"
          subtitle="Normal distribution curve across 20k verified merchants."
        >
          <div className="py-6">
            <PpEmptyState
              icon={BarChart3}
              title="Awaiting ROAS cohort distribution"
              description="Aggregated benchmark distribution data will appear once merchant cohort telemetry is connected."
            />
          </div>
          <div className="mt-4 border-t border-pp-outline-variant/30 pt-3 text-xs text-pp-outline">
            Peer Median: <strong>Standby</strong> • 90th Percentile: <strong>Standby</strong>
          </div>
        </PpCard>

        {/* Widget 2: CAC Efficiency Pacing */}
        <PpCard
          title="CAC Efficiency Pacing"
          subtitle="Your acquisition cost vs peer tier boundaries."
        >
          <div className="py-6">
            <PpEmptyState
              icon={BarChart3}
              title="Awaiting CAC boundary metrics"
              description="Peer efficiency pacing thresholds require cross-merchant benchmark indexing."
            />
          </div>
          <div className="mt-4 border-t border-pp-outline-variant/30 pt-3 text-xs text-pp-outline">
            Efficient: <strong>Standby</strong> • High CAC: <strong>Standby</strong>
          </div>
        </PpCard>

        {/* Widget 3: Customer Loyalty Over Time */}
        <PpCard
          title="Customer Loyalty Over Time (Retention)"
          subtitle="Trailing 12-month cohort retention curve comparison."
        >
          <div className="py-6">
            <PpEmptyState
              icon={BarChart3}
              title="Awaiting cohort retention benchmark"
              description="Aggregated retention benchmarking will populate as industry cohorts are computed."
            />
          </div>
          <div className="mt-4 border-t border-pp-outline-variant/30 pt-3 text-xs text-pp-outline">
            Industry Benchmark: <strong>Standby</strong>
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
      connectorId="stripe"
      metricKey="LTV"
    >
      {hubContent}
    </MissingIntegrationOverlay>
  );
}
