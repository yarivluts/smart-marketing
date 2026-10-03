'use client';

import React, { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';

export interface WaterfallStep {
  name: string;
  amount: number;
  type: 'base' | 'positive' | 'negative' | 'total';
  color: string;
}

export interface MrrWaterfallDashboardProps {
  orgId?: string;
  projectId?: string;
  isDataConnected?: boolean;
  initialSteps?: WaterfallStep[];
}

const DEFAULT_STEPS: WaterfallStep[] = [
  { name: 'Starting MRR', amount: 128400, type: 'base', color: 'bg-slate-500' },
  { name: 'New MRR', amount: 18500, type: 'positive', color: 'bg-emerald-500' },
  { name: 'Expansion MRR', amount: 6200, type: 'positive', color: 'bg-teal-400' },
  { name: 'Churn MRR', amount: -2800, type: 'negative', color: 'bg-rose-500' },
  { name: 'Contraction MRR', amount: -1100, type: 'negative', color: 'bg-amber-500' },
  { name: 'Ending MRR', amount: 149200, type: 'total', color: 'bg-primary' },
];

export function MrrWaterfallDashboard({
  orgId = 'demo-org',
  projectId = 'demo-project',
  isDataConnected = true,
  initialSteps,
}: MrrWaterfallDashboardProps) {
  const [steps, setSteps] = useState<WaterfallStep[]>(initialSteps && initialSteps.length > 0 ? initialSteps : DEFAULT_STEPS);
  const [timeRange, setTimeRange] = useState<'12m' | 'ytd' | 'qtr'>('12m');

  const content = (
    <div className="space-y-8" data-testid="mrr-waterfall-dashboard">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>GrowthOS</span>
            <span>&gt;</span>
            <span className="text-foreground">Revenue Intelligence</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            MRR Growth Dynamics & Waterfall
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            Decomposed monthly recurring revenue movements: new subscriptions, expansions, churn, and contractions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-card p-1 shadow-sm">
            {(['12m', 'ytd', 'qtr'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setTimeRange(r)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                  timeRange === r
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r === '12m' ? 'Last 12 Mo' : r === 'ytd' ? 'YTD' : 'Last Quarter'}
              </button>
            ))}
          </div>

          <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm">
            USD ($)
          </span>
        </div>
      </div>

      {/* 4 Scorecards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Net MRR Churn */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Net MRR Churn
            </span>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
              Healthy
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-emerald-600">
            -0.4%
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Negative churn (expansion exceeding loss)
          </div>
        </div>

        {/* LTV / CAC */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              LTV / CAC Ratio
            </span>
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-0.5">
              <TrendingUp className="h-3 w-3" /> +0.3
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-foreground">
            4.2x
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Capital efficiency benchmark (&gt;3.0x)
          </div>
        </div>

        {/* Quick Ratio */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Quick Ratio
            </span>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600">
              Target: 2.0
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-foreground">
            1.8
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            (New + Expansion) / (Churn + Contraction)
          </div>
        </div>

        {/* Gross Margin */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Gross Margin
            </span>
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-0.5">
              <TrendingUp className="h-3 w-3" /> +1.2%
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-foreground">
            84.5%
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Software gross margin profile
          </div>
        </div>
      </div>

      {/* Waterfall Visualization & Steps */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-border pb-4 mb-6">
          <div>
            <h2 className="text-base font-bold tracking-tight text-foreground">
              MRR Waterfall Decomposition
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Monthly step-by-step Bridge from Starting MRR to Ending MRR.
            </p>
          </div>
          <span className="text-xs font-bold text-primary">+$20,800 Net Growth</span>
        </div>

        {/* Visual Waterfall Bars */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {steps.map((step) => {
            const isPositive = step.amount > 0 && step.type !== 'base' && step.type !== 'total';
            const isNegative = step.amount < 0;
            return (
              <div
                key={step.name}
                className="flex flex-col justify-between rounded-xl border border-border bg-muted/20 p-4 transition-colors hover:bg-muted/40"
              >
                <div>
                  <span className="text-[11px] font-bold text-muted-foreground uppercase">
                    {step.name}
                  </span>
                  <div
                    className={`mt-2 font-mono text-xl font-bold ${
                      isPositive
                        ? 'text-emerald-600'
                        : isNegative
                        ? 'text-rose-600'
                        : 'text-foreground'
                    }`}
                  >
                    {isPositive ? `+$${step.amount.toLocaleString()}` : isNegative ? `-$${Math.abs(step.amount).toLocaleString()}` : `$${step.amount.toLocaleString()}`}
                  </div>
                </div>

                <div className="mt-4 pt-2 border-t border-border/50">
                  <div className={`h-2 w-full rounded-full ${step.color}`} />
                </div>
              </div>
            );
          })}
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
