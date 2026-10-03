'use client';

import React, { useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Heart,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';

export interface ProductTelemetryDashboardProps {
  orgId?: string;
  projectId?: string;
  isDataConnected?: boolean;
}

export function ProductTelemetryDashboard({
  orgId = 'demo-org',
  projectId = 'demo-project',
  isDataConnected = true,
}: ProductTelemetryDashboardProps) {
  const [timeRange, setTimeRange] = useState<'l28' | 'l90'>('l28');

  // 28 days activity distribution percentages for the power curve
  const l28Distribution = [
    20, 16, 12, 10, 8, // Casual: 1-5 days
    15, 18, 22, 25, 28, 32, 35, 38, 42, 45, 48, 52, 55, 60, // Core: 6-19 days
    65, 72, 80, 85, 90, 88, 95, 92, 100, // Power: 20-28 days
  ];

  const content = (
    <div className="space-y-8" data-testid="product-telemetry-dashboard">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>GrowthOS</span>
            <span>&gt;</span>
            <span className="text-foreground">Product Telemetry</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            DAU/MAU Stickiness, L28 Power Curve & Feature Activation
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            Live product engagement telemetry capturing daily active habits and conversion drop-offs.
          </p>
        </div>

        <div className="inline-flex rounded-full border border-border bg-card p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setTimeRange('l28')}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              timeRange === 'l28'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Last 28 Days (Rolling)
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('l90')}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              timeRange === 'l90'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Last 90 Days
          </button>
        </div>
      </div>

      {/* 4 Health Scorecards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Stickiness */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <Activity className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
              &gt;30% Benchmark
            </span>
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            DAU / MAU Ratio (Stickiness)
          </p>
          <div className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            38.4%
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            High organic user return rate
          </div>
        </div>

        {/* Card 2: DAU */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600">
              <ArrowUpRight className="h-3 w-3" />
              +8.2%
            </span>
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Daily Active Users (DAU)
          </p>
          <div className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            14,850
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Unique accounts active today
          </div>
        </div>

        {/* Card 3: MAU */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
              <UserCheck className="h-5 w-5" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">Monthly</span>
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Monthly Active Users (MAU)
          </p>
          <div className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            38,680
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Rolling 30-day active population
          </div>
        </div>

        {/* Card 4: NPS */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600">
              <Heart className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-600">
              World-Class
            </span>
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Net Promoter Score (NPS)
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-foreground">+64</span>
            <span className="text-xs text-muted-foreground">78% Promoters</span>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Exceeds B2B median (+42)
          </div>
        </div>
      </div>

      {/* Main Charts: L28 Histogram (Power Curve) & Feature Activation Funnel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* L28 Activity Distribution Histogram */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold tracking-tight text-foreground">
                  L28 User Activity Distribution
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Power User Curve (Active days out of last 28 days)
                </p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Days Active
              </span>
            </div>

            {/* 28-Bar Histogram Visual */}
            <div className="mt-8 flex items-end justify-between gap-1 h-44 pb-2 border-b border-border">
              {l28Distribution.map((heightPercent, index) => {
                const day = index + 1;
                const isPower = day >= 20;
                const isCore = day >= 6 && day < 20;
                return (
                  <div
                    key={day}
                    title={`Day ${day}: ${heightPercent}% activity frequency`}
                    className="flex-1 flex flex-col items-center justify-end h-full group relative"
                  >
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full rounded-t-sm transition-all group-hover:scale-y-105 ${
                        isPower
                          ? 'bg-gradient-to-t from-primary to-purple-500 shadow-[0_0_8px_rgba(139,92,246,0.3)]'
                          : isCore
                          ? 'bg-primary/30 group-hover:bg-primary/60'
                          : 'bg-muted-foreground/20 group-hover:bg-muted-foreground/40'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grouping Legend */}
          <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
              <div>
                <span className="font-semibold text-foreground">Casual</span>
                <span className="text-[10px] text-muted-foreground ml-1">(1-5 days, 32%)</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-primary/40" />
              <div>
                <span className="font-semibold text-foreground">Core</span>
                <span className="text-[10px] text-muted-foreground ml-1">(6-19 days, 44%)</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              <div>
                <span className="font-bold text-primary">Power Users</span>
                <span className="text-[10px] text-primary ml-1">(20-28 days, 24%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Core Product Feature Activation Funnel */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold tracking-tight text-foreground">
                  Core Product Feature Activation
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Onboarding progression from registration to document completion.
                </p>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600">
                58.0% Completed
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {/* Step 1 */}
              <div className="relative overflow-hidden rounded-xl border border-border bg-muted/20 p-3.5 flex items-center justify-between">
                <div
                  className="absolute left-0 top-0 h-full bg-muted/40 pointer-events-none"
                  style={{ width: '100%' }}
                />
                <div className="relative z-10 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <UserPlus className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-foreground">Account Created</div>
                    <div className="text-[10px] text-muted-foreground">3,840 users registered</div>
                  </div>
                </div>
                <span className="relative z-10 font-bold text-xs">100%</span>
              </div>

              {/* Step 2 */}
              <div className="relative overflow-hidden rounded-xl border border-border bg-muted/20 p-3.5 flex items-center justify-between">
                <div
                  className="absolute left-0 top-0 h-full bg-primary/10 pointer-events-none"
                  style={{ width: '84.2%' }}
                />
                <div className="relative z-10 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-foreground">1st Document Uploaded</div>
                    <div className="text-[10px] text-muted-foreground">3,233 users uploaded PDF</div>
                  </div>
                </div>
                <span className="relative z-10 font-bold text-xs text-foreground">84.2%</span>
              </div>

              {/* Step 3 */}
              <div className="relative overflow-hidden rounded-xl border border-border bg-muted/20 p-3.5 flex items-center justify-between">
                <div
                  className="absolute left-0 top-0 h-full bg-purple-500/10 pointer-events-none"
                  style={{ width: '71.5%' }}
                />
                <div className="relative z-10 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-foreground">Signature Fields Placed</div>
                    <div className="text-[10px] text-muted-foreground">2,745 configured fields</div>
                  </div>
                </div>
                <span className="relative z-10 font-bold text-xs text-foreground">71.5%</span>
              </div>

              {/* Step 4 */}
              <div className="relative overflow-hidden rounded-xl border border-border bg-muted/20 p-3.5 flex items-center justify-between">
                <div
                  className="absolute left-0 top-0 h-full bg-emerald-500/15 pointer-events-none"
                  style={{ width: '58.0%' }}
                />
                <div className="relative z-10 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-foreground">Contract Executed & Signed</div>
                    <div className="text-[10px] text-muted-foreground">2,227 completed full cycle</div>
                  </div>
                </div>
                <span className="relative z-10 font-bold text-xs text-emerald-600">58.0%</span>
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground flex items-center justify-between">
            <span>Onboarding Drop-off: Primary friction is between Field Placement & Sign</span>
            <span className="font-semibold text-primary">Action: Auto-template wizard</span>
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
      connectorId="growthos_web_sdk"
      metricKey="DAU_MAU"
    >
      {content}
    </MissingIntegrationOverlay>
  );
}
