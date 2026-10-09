'use client';

import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  ShieldCheck,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Info,
} from 'lucide-react';
import type {
  ComparisonTarget,
  IndustryCohort,
  PeerBenchmarksTelemetryResult,
} from '@growthos/shared';
import { computePeerBenchmarkTelemetry } from '@growthos/shared';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';
import {
  PpCard,
  PpKpiGrid,
  PpKpiCard,
  PpEmptyState,
  ppInputClass,
  type PpAccent,
} from '@/components/pastel/primitives';

export interface PeerBenchmarksHubProps {
  orgId?: string;
  projectId?: string;
  isDataConnected?: boolean;
  initialTelemetry?: PeerBenchmarksTelemetryResult;
}

function mapBadgeAccent(accent: 'emerald' | 'primary' | 'sky' | 'amber' | 'rose'): PpAccent {
  switch (accent) {
    case 'emerald':
      return 'mint';
    case 'primary':
      return 'primary';
    case 'sky':
      return 'sky';
    case 'amber':
      return 'amber';
    case 'rose':
      return 'error';
    default:
      return 'neutral';
  }
}

export function PeerBenchmarksHub({
  orgId = 'demo-org',
  projectId = 'demo-project',
  isDataConnected = true,
  initialTelemetry,
}: PeerBenchmarksHubProps) {
  const [industry, setIndustry] = useState<IndustryCohort>(
    initialTelemetry?.industry ?? 'b2b_saas',
  );
  const [cohortComparison, setCohortComparison] = useState<ComparisonTarget>(
    initialTelemetry?.comparisonTarget ?? 'all',
  );

  // Derive dynamic telemetry based on user's selected filters
  const telemetry: PeerBenchmarksTelemetryResult = useMemo(() => {
    if (
      initialTelemetry &&
      initialTelemetry.industry === industry &&
      initialTelemetry.comparisonTarget === cohortComparison
    ) {
      return initialTelemetry;
    }
    return computePeerBenchmarkTelemetry(
      initialTelemetry
        ? {
            roas: initialTelemetry.scorecards.roas.projectValue,
            cac: initialTelemetry.scorecards.cac.projectValue,
            conversionRate: initialTelemetry.scorecards.conversionRate.projectValue,
            ctr: initialTelemetry.scorecards.ctr.projectValue,
          }
        : {},
      {
        industry,
        comparisonTarget: cohortComparison,
      },
    );
  }, [initialTelemetry, industry, cohortComparison]);

  const { scorecards, distributions, retentionCurve, recommendations, kAnonymityPassed } =
    telemetry;

  // Normal distribution bell curve calculation for ROAS
  const roasMin = Math.max(0.5, distributions.roas.p10 * 0.7);
  const roasMax = Math.max(distributions.roas.p90 * 1.3, 7.0);
  const roasRange = roasMax - roasMin;
  const projectRoasX = Math.max(
    30,
    Math.min(330, 20 + ((scorecards.roas.projectValue - roasMin) / roasRange) * 320),
  );
  const medianRoasX = Math.max(
    30,
    Math.min(330, 20 + ((distributions.roas.p50 - roasMin) / roasRange) * 320),
  );
  const p90RoasX = Math.max(
    30,
    Math.min(330, 20 + ((distributions.roas.p90 - roasMin) / roasRange) * 320),
  );

  // Normal distribution bell curve points
  const curvePoints = useMemo(() => {
    const points: [number, number][] = [];
    const meanX = 180;
    const stdDevPx = 55;
    for (let x = 20; x <= 340; x += 8) {
      const exponent = -0.5 * Math.pow((x - meanX) / stdDevPx, 2);
      const y = 135 - 95 * Math.exp(exponent);
      points.push([x, y]);
    }
    return points;
  }, []);

  const pathD = useMemo(() => {
    if (curvePoints.length === 0) return '';
    const start = `M ${curvePoints[0][0]} 140 L ${curvePoints[0][0]} ${curvePoints[0][1]}`;
    const curve = curvePoints.slice(1).map(([x, y]) => `L ${x} ${y}`).join(' ');
    const end = `L ${curvePoints[curvePoints.length - 1][0]} 140 Z`;
    return `${start} ${curve} ${end}`;
  }, [curvePoints]);

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

      {/* Cohort Filter Controls & Privacy Badge */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value as IndustryCohort)}
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

        {/* k-Anonymity Privacy Guarantee Badge */}
        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 font-pp-label-sm text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>k-Anonymity Verified (k &ge; 5)</span>
        </div>

        <div className="ms-auto flex items-center gap-2">
          <span className="font-pp-label-sm text-xs font-medium text-pp-outline">Compare Against:</span>
          <select
            value={cohortComparison}
            onChange={(e) => setCohortComparison(e.target.value as ComparisonTarget)}
            className={`rounded-full px-3.5 py-2 font-pp-label-sm text-xs font-bold ${ppInputClass}`}
          >
            <option value="all">All {industry === 'b2b_saas' ? 'B2B SaaS' : industry === 'ecommerce' ? 'E-Commerce' : 'FinTech'} Cohorts</option>
            <option value="top10">Top 10% Performers</option>
            <option value="direct">Direct Competitors</option>
          </select>
        </div>
      </div>

      {!kAnonymityPassed ? (
        <PpCard title="Cohort Telemetry Under Privacy Threshold">
          <PpEmptyState
            icon={ShieldCheck}
            title="Insufficient Cohort Sample Size"
            description="GrowthOS enforces privacy-preserving k-anonymity (minimum 5 distinct verified merchants). Please select a broader industry cohort to unlock benchmark percentiles."
          />
        </PpCard>
      ) : (
        <>
          {/* 4 Core Benchmark Scorecards */}
          <PpKpiGrid>
            <PpKpiCard
              label="Sales Return"
              value={scorecards.roas.projectValue > 0 ? `${scorecards.roas.projectValue}x` : '—'}
              valueSuffix="(for every $1 spent)"
              accent="primary"
              badge={scorecards.roas.statusBadge}
              badgeAccent={mapBadgeAccent(scorecards.roas.statusAccent)}
              footer={`Peer Median: ${scorecards.roas.cohortMedian}x • 90th %ile: ${scorecards.roas.cohortTop10}x (${scorecards.roas.percentileRank}th percentile)`}
            />

            <PpKpiCard
              label="Cost to Get a Customer"
              value={scorecards.cac.projectValue > 0 ? `$${scorecards.cac.projectValue}` : '—'}
              valueSuffix="Blended CAC"
              accent="mint"
              badge={scorecards.cac.statusBadge}
              badgeAccent={mapBadgeAccent(scorecards.cac.statusAccent)}
              footer={`Peer Median: $${scorecards.cac.cohortMedian} • Top 10%: $${scorecards.cac.cohortTop10} (${scorecards.cac.percentileRank}th percentile)`}
            />

            <PpKpiCard
              label="Landing Page Success Rate"
              value={scorecards.conversionRate.projectValue > 0 ? `${scorecards.conversionRate.projectValue}%` : '—'}
              valueSuffix="Visitor to Lead"
              accent="sky"
              badge={scorecards.conversionRate.statusBadge}
              badgeAccent={mapBadgeAccent(scorecards.conversionRate.statusAccent)}
              footer={`Peer Median: ${scorecards.conversionRate.cohortMedian}% • Top 10%: ${scorecards.conversionRate.cohortTop10}% (${scorecards.conversionRate.percentileRank}th percentile)`}
            />

            <PpKpiCard
              label="Ad Click-Through Rate"
              value={scorecards.ctr.projectValue > 0 ? `${scorecards.ctr.projectValue}%` : '—'}
              valueSuffix="Blended CTR"
              accent="primary"
              badge={scorecards.ctr.statusBadge}
              badgeAccent={mapBadgeAccent(scorecards.ctr.statusAccent)}
              footer={`Peer Median: ${scorecards.ctr.cohortMedian}% • Top 10%: ${scorecards.ctr.cohortTop10}% (${scorecards.ctr.percentileRank}th percentile)`}
            />
          </PpKpiGrid>

          {/* Distribution Curves & Charts Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Widget 1: ROAS Distribution Bell Curve */}
            <PpCard
              title="ROAS Distribution"
              subtitle="Normal distribution curve across 20k verified merchants."
            >
              <div className="pt-2">
                <div className="relative h-44 w-full">
                  <svg
                    aria-label="ROAS Normal Distribution Bell Curve"
                    viewBox="0 0 360 160"
                    className="h-full w-full overflow-visible"
                  >
                    <defs>
                      <linearGradient id="roasGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>

                    {/* Area under normal curve */}
                    <path d={pathD} fill="url(#roasGradient)" />
                    {/* Outline of bell curve */}
                    <path
                      d={curvePoints.map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`)).join(' ')}
                      fill="none"
                      stroke="#4f46e5"
                      strokeWidth="2.5"
                    />

                    {/* Base horizontal axis */}
                    <line x1="16" y1="140" x2="344" y2="140" stroke="#cbd5e1" strokeWidth="1.5" />

                    {/* Peer Median marker line */}
                    <line
                      x1={medianRoasX}
                      y1="40"
                      x2={medianRoasX}
                      y2="140"
                      stroke="#94a3b8"
                      strokeDasharray="3 3"
                      strokeWidth="1.5"
                    />
                    <text
                      x={medianRoasX}
                      y="32"
                      fill="#64748b"
                      fontSize="9"
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      P50: {distributions.roas.p50}x
                    </text>

                    {/* Top 10% marker line */}
                    <line
                      x1={p90RoasX}
                      y1="60"
                      x2={p90RoasX}
                      y2="140"
                      stroke="#059669"
                      strokeDasharray="3 3"
                      strokeWidth="1.5"
                    />
                    <text
                      x={p90RoasX}
                      y="54"
                      fill="#059669"
                      fontSize="9"
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      Top 10%: {distributions.roas.p90}x
                    </text>

                    {/* "You" marker pin */}
                    <circle cx={projectRoasX} cy="90" r="12" fill="#6366f1" opacity="0.25" className="animate-ping" />
                    <circle cx={projectRoasX} cy="90" r="5.5" fill="#4338ca" stroke="#ffffff" strokeWidth="2" />
                    <rect
                      x={projectRoasX - 32}
                      y="100"
                      width="64"
                      height="18"
                      rx="4"
                      fill="#1e1b4b"
                    />
                    <text
                      x={projectRoasX}
                      y="112"
                      fill="#ffffff"
                      fontSize="9"
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      You: {scorecards.roas.projectValue}x
                    </text>
                  </svg>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-pp-outline-variant/30 pt-3 text-xs text-pp-outline">
                  <span>
                    Peer Median: <strong>{distributions.roas.p50}x</strong>
                  </span>
                  <span>
                    90th Percentile: <strong>{distributions.roas.p90}x</strong>
                  </span>
                </div>
              </div>
            </PpCard>

            {/* Widget 2: CAC Efficiency Pacing */}
            <PpCard
              title="CAC Efficiency Pacing"
              subtitle="Your acquisition cost vs peer tier boundaries."
            >
              <div className="space-y-4 pt-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-pp-headline-md text-xl font-bold text-pp-on-surface">
                    ${scorecards.cac.projectValue}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-pp-label-sm text-xs font-bold ${
                      scorecards.cac.deltaVsMedianPct <= 0 ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {scorecards.cac.deltaVsMedianPct <= 0 ? (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    )}
                    {Math.abs(scorecards.cac.deltaVsMedianPct)}% {scorecards.cac.deltaVsMedianPct <= 0 ? 'more efficient' : 'higher'} than median
                  </span>
                </div>

                {/* Segmented Efficiency Gauge Bar */}
                <div className="space-y-1.5">
                  <div className="relative h-4 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    {/* Zone 1: Efficient (Green) */}
                    <div className="absolute inset-y-0 left-0 w-1/3 bg-emerald-400/80" />
                    {/* Zone 2: Average (Blue) */}
                    <div className="absolute inset-y-0 left-1/3 w-1/3 bg-indigo-400/70" />
                    {/* Zone 3: High CAC (Amber) */}
                    <div className="absolute inset-y-0 left-2/3 w-1/3 bg-amber-400/70" />

                    {/* Indicator Needle */}
                    <div
                      className="absolute top-0 bottom-0 w-2 -translate-x-1/2 rounded-full border border-white bg-slate-900 shadow-sm transition-all"
                      style={{
                        left: `${Math.min(95, Math.max(5, 100 - scorecards.cac.percentileRank))}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-semibold text-pp-outline">
                    <span className="text-emerald-600">Efficient (&lt; ${distributions.cac.p25})</span>
                    <span className="text-indigo-600">Median (${distributions.cac.p50})</span>
                    <span className="text-amber-600">High CAC (&gt; ${distributions.cac.p75})</span>
                  </div>
                </div>

                <div className="rounded-xl border border-pp-outline-variant/40 bg-pp-surface-container-low p-3 text-xs text-pp-on-surface-variant">
                  <div className="font-semibold text-pp-on-surface">Pacing Position: {scorecards.cac.statusBadge}</div>
                  <p className="mt-0.5 text-pp-outline">
                    Ranked at the <strong>{scorecards.cac.percentileRank}th percentile</strong> of customer acquisition efficiency across {industry.replace('_', ' ')} peers.
                  </p>
                </div>

                <div className="border-t border-pp-outline-variant/30 pt-3 text-xs text-pp-outline">
                  Efficient: <strong>&lt; ${distributions.cac.p25}</strong> • High CAC: <strong>&gt; ${distributions.cac.p75}</strong>
                </div>
              </div>
            </PpCard>

            {/* Widget 3: Customer Loyalty Over Time (Retention) */}
            <PpCard
              title="Customer Loyalty Over Time (Retention)"
              subtitle="Trailing 12-month cohort retention curve comparison."
            >
              <div className="space-y-3 pt-1">
                {retentionCurve.map((point) => (
                  <div key={point.month} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-pp-on-surface">{point.month} Cohort</span>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-pp-primary">
                          You: {point.projectRetentionPct}%
                        </span>
                        <span className="text-pp-outline">
                          Peer: {point.cohortMedianRetentionPct}%
                        </span>
                      </div>
                    </div>
                    {/* Comparative bars */}
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      {/* Peer median bar */}
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-slate-300 dark:bg-slate-600"
                        style={{ width: `${point.cohortMedianRetentionPct}%` }}
                      />
                      {/* Project bar */}
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-pp-primary shadow-xs"
                        style={{ width: `${point.projectRetentionPct}%` }}
                      />
                    </div>
                  </div>
                ))}

                <div className="mt-2 border-t border-pp-outline-variant/30 pt-3 text-xs text-pp-outline">
                  Industry Benchmark: <strong>{retentionCurve[retentionCurve.length - 1]?.cohortMedianRetentionPct ?? 43}%</strong> at Month 12
                </div>
              </div>
            </PpCard>
          </div>

          {/* Algorithmic Guidance & Actionable Recommendations */}
          {recommendations.length > 0 && (
            <PpCard
              title="Algorithmic Growth Guidance"
              subtitle="Data-driven optimizations derived from your peer benchmark percentile positioning."
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {recommendations.map((rec, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 rounded-2xl border border-pp-outline-variant/50 bg-pp-surface-container-low p-4 shadow-2xs"
                  >
                    <div className="rounded-full bg-pp-primary-fixed p-2 text-pp-primary shrink-0">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-pp-label-md text-xs font-bold uppercase tracking-wider text-pp-primary">
                        Recommendation #{index + 1}
                      </div>
                      <p className="mt-0.5 font-pp-body-sm text-pp-body-sm text-pp-on-surface">
                        {rec}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </PpCard>
          )}
        </>
      )}
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
