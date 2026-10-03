'use client';

import React, { useState } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';

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
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>GrowthOS</span>
          <span>&gt;</span>
          <span className="text-foreground">Market Intelligence</span>
        </div>
        <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Dynamic Peer Benchmarks
          </h1>
          <span className="text-sm font-medium text-muted-foreground">
            (20,000+ Active Brands Like Yours)
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          Real-time algorithmic comparison against verified merchant cohorts across blended ad spend, CAC velocity, and retention.
        </p>
      </div>

      {/* Cohort Filter Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground shadow-sm focus:outline-none"
        >
          <option value="b2b_saas">Industry: B2B SaaS & Productivity</option>
          <option value="ecommerce">Industry: Direct-to-Consumer & Retail</option>
          <option value="fintech">Industry: FinTech & Payments</option>
        </select>

        <div className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground shadow-sm">
          Spend: <strong className="text-foreground">$50k - $150k / mo</strong>
        </div>

        <div className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground shadow-sm">
          Region: <strong className="text-foreground">Global</strong>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Compare Against:</span>
          <select
            value={cohortComparison}
            onChange={(e) => setCohortComparison(e.target.value)}
            className="rounded-xl bg-primary/10 px-3.5 py-2 text-xs font-bold text-primary focus:outline-none"
          >
            <option value="all">All B2B SaaS Cohorts</option>
            <option value="top10">Top 10% Performers</option>
            <option value="direct">Direct Competitors</option>
          </select>
        </div>
      </div>

      {/* 4 Core Benchmark Scorecards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Sales Return */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
          <div>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">Sales Return</h3>
                <span className="text-xs text-muted-foreground">(for every $1 spent)</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600">
                <ArrowUpRight className="h-3 w-3" />
                Top 12%
              </span>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-foreground">3.84x</span>
              <span className="text-xs text-muted-foreground">vs 2.65x peer avg</span>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
            You are generating <strong className="text-foreground">+44.9%</strong> more revenue per ad dollar than typical brands.
          </div>
        </div>

        {/* Card 2: Cost to Get a Customer */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
          <div>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">Cost to Get a Customer</h3>
                <span className="text-xs text-muted-foreground">Blended CAC</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600">
                <ArrowDownRight className="h-3 w-3" />
                Top 15%
              </span>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-foreground">$16.20</span>
              <span className="text-xs text-muted-foreground">vs $24.50 peer avg</span>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
            You spend <strong className="text-foreground">-$8.30 less</strong> per acquired customer than peer median.
          </div>
        </div>

        {/* Card 3: Landing Page Success */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
          <div>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">Landing Page Success Rate</h3>
                <span className="text-xs text-muted-foreground">Visitor to Lead</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600">
                <ArrowUpRight className="h-3 w-3" />
                Top 8%
              </span>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-foreground">3.82%</span>
              <span className="text-xs text-muted-foreground">vs 2.40% peer avg</span>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
            Your landing pages convert at <strong className="text-foreground">1.59x</strong> the B2B benchmark.
          </div>
        </div>

        {/* Card 4: Ad CTR */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
          <div>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">Ad Click-Through Rate</h3>
                <span className="text-xs text-muted-foreground">Blended CTR</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600">
                <ArrowUpRight className="h-3 w-3" />
                Top 10%
              </span>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-foreground">2.85%</span>
              <span className="text-xs text-muted-foreground">vs 1.65% peer avg</span>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
            Your ad creatives generate <strong className="text-foreground">+72.7%</strong> higher engagement than peers.
          </div>
        </div>
      </div>

      {/* Distribution Curves & Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Widget 1: ROAS Distribution Bell Curve */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">ROAS Distribution</h3>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                Top Decile
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Normal distribution curve across 20k verified merchants.
            </p>

            <div className="relative mt-6 h-32 w-full">
              <svg className="h-full w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 200 80">
                {/* Peer Curve Area */}
                <path
                  d="M0 75 Q 50 75, 100 10 T 200 75"
                  fill="currentColor"
                  fillOpacity="0.08"
                  stroke="#8b5cf6"
                  strokeWidth="2"
                />
                {/* Median Line */}
                <line x1="100" y1="10" x2="100" y2="75" stroke="#94a3b8" strokeDasharray="3 3" strokeWidth="1.5" />
                {/* Your Brand Position */}
                <circle cx="160" cy="45" r="4.5" fill="#8b5cf6" stroke="white" strokeWidth="2" />
                <text x="160" y="32" textAnchor="middle" className="text-[10px] font-bold fill-foreground">
                  3.84x
                </text>
              </svg>
            </div>
          </div>

          <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            Peer Median: <strong>2.65x</strong> • 90th Percentile: <strong>3.75x</strong>
          </div>
        </div>

        {/* Widget 2: CAC Efficiency Pacing */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <h3 className="text-sm font-bold text-foreground">CAC Efficiency Pacing</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Your acquisition cost vs peer tier boundaries.
            </p>

            <div className="mt-8 space-y-4">
              <div className="relative h-4 w-full overflow-hidden rounded-full bg-muted flex">
                <div className="h-full bg-emerald-500" style={{ width: '35%' }} title="Top Tier: $0-$18" />
                <div className="h-full bg-amber-400" style={{ width: '30%' }} title="Median Tier: $18-$30" />
                <div className="h-full bg-rose-500" style={{ width: '35%' }} title="At Risk: $30+" />
              </div>

              {/* Marker */}
              <div className="relative">
                <div className="absolute -top-7" style={{ left: '32%' }}>
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-bold text-foreground">$16.20</span>
                    <div className="h-2.5 w-0.5 bg-foreground" />
                  </div>
                </div>
                <div className="flex justify-between text-[10px] font-medium text-muted-foreground pt-1">
                  <span>$0 (Efficient)</span>
                  <span>$18</span>
                  <span>$30</span>
                  <span>$50+ (High CAC)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-border pt-3 text-xs font-semibold text-emerald-600">
            ✓ Situated firmly in the Lowest Quartile (Top Efficiency)
          </div>
        </div>

        {/* Widget 3: Conversion Rate Trend */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">LP Conv. Rate vs Trend</h3>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                HEALTHY
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Weekly conversion trajectory vs B2B benchmark baseline.
            </p>

            <div className="relative mt-6 h-32 w-full">
              <svg className="h-full w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 40">
                {/* Brand Line */}
                <path
                  d="M0 35 Q 20 30, 40 32 T 60 15 T 80 18 T 100 5"
                  fill="none"
                  stroke="#8b5cf6"
                  strokeWidth="2.5"
                />
                {/* Benchmark Baseline */}
                <path
                  d="M0 30 L 20 28 L 40 31 L 60 29 L 80 32 L 100 30"
                  fill="none"
                  stroke="#94a3b8"
                  strokeDasharray="2 2"
                  strokeWidth="1.2"
                />
              </svg>
            </div>
          </div>

          <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-purple-500 mr-1" />
            Your Brand (3.82%) vs{' '}
            <span className="inline-block h-1.5 w-3 border-b border-dashed border-muted-foreground mr-1" />
            Peer Baseline (2.40%)
          </div>
        </div>
      </div>

      {/* Customer Loyalty Over Time Heatmap Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-5">
          <h2 className="text-base font-bold tracking-tight text-foreground">
            Customer Loyalty Over Time (Retention Benchmark)
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Cohort survival probability by customer vintage compared to market average.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="py-3.5 px-6 font-semibold w-1/4">COHORT GROUP</th>
                <th className="py-3.5 px-4 font-semibold text-center">MONTH 1</th>
                <th className="py-3.5 px-4 font-semibold text-center">MONTH 2</th>
                <th className="py-3.5 px-4 font-semibold text-center">MONTH 3</th>
                <th className="py-3.5 px-4 font-semibold text-center">MONTH 4</th>
                <th className="py-3.5 px-4 font-semibold text-center">MONTH 5</th>
                <th className="py-3.5 px-4 font-semibold text-center">MONTH 6</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {/* Your Brand Row */}
              <tr className="transition-colors hover:bg-muted/40 font-medium">
                <td className="py-4 px-6 font-bold text-foreground flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                  Your Brand
                </td>
                <td className="py-4 px-4 text-center font-bold bg-primary/10 text-primary">82%</td>
                <td className="py-4 px-4 text-center font-bold bg-primary/10 text-primary">65%</td>
                <td className="py-4 px-4 text-center font-bold bg-primary/5 text-foreground">58%</td>
                <td className="py-4 px-4 text-center text-foreground">42%</td>
                <td className="py-4 px-4 text-center text-foreground">38%</td>
                <td className="py-4 px-4 text-center text-foreground">31%</td>
              </tr>
              {/* Peer Median Row */}
              <tr className="bg-muted/10 text-muted-foreground">
                <td className="py-4 px-6 font-medium flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
                  Average Brand (Median)
                </td>
                <td className="py-4 px-4 text-center">75%</td>
                <td className="py-4 px-4 text-center">55%</td>
                <td className="py-4 px-4 text-center">45%</td>
                <td className="py-4 px-4 text-center">38%</td>
                <td className="py-4 px-4 text-center">32%</td>
                <td className="py-4 px-4 text-center">28%</td>
              </tr>
            </tbody>
          </table>
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
      metricKey="LTV"
    >
      {hubContent}
    </MissingIntegrationOverlay>
  );
}
