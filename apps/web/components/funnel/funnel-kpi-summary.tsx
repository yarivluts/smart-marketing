'use client';

import React from 'react';
import { ArrowUpRight, CheckCircle2, TrendingDown, Users } from 'lucide-react';
import type { FunnelSummaryMetrics } from './funnel-types';

export interface FunnelKpiSummaryProps {
  metrics: FunnelSummaryMetrics;
  className?: string;
}

export function FunnelKpiSummary({
  metrics,
  className = '',
}: FunnelKpiSummaryProps): React.ReactElement {
  return (
    <div
      data-testid="funnel-kpi-summary"
      className={`grid grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}
    >
      {/* 1. Overall Conversion Rate */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-border/80 bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
          <span>Overall Conversion</span>
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <ArrowUpRight className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span
            data-testid="kpi-overall-conversion"
            dir="ltr"
            className="text-2xl font-bold tracking-tight text-foreground"
          >
            {`${metrics.overallConversionRate}%`}
          </span>
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            Top 15% SaaS
          </span>
        </div>
      </div>

      {/* 2. Total Started */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-border/80 bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
          <span>Total Started</span>
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Users className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span
            data-testid="kpi-total-started"
            dir="ltr"
            className="text-2xl font-bold tracking-tight text-foreground"
          >
            {metrics.totalStarted.toLocaleString()}
          </span>
          <span className="text-[11px] text-muted-foreground">Unique entrants</span>
        </div>
      </div>

      {/* 3. Total Converted */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-border/80 bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
          <span>Total Converted</span>
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span
            data-testid="kpi-total-converted"
            dir="ltr"
            className="text-2xl font-bold tracking-tight text-foreground"
          >
            {metrics.totalCompleted.toLocaleString()}
          </span>
          <span className="text-[11px] text-muted-foreground">Completed goals</span>
        </div>
      </div>

      {/* 4. Biggest Bottleneck / Velocity */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-border/80 bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
          <span>Top Bottleneck</span>
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <TrendingDown className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span
            data-testid="kpi-bottleneck-label"
            className="text-sm font-bold text-foreground truncate"
          >
            {metrics.highestDropOffStage?.stageLabel ?? 'None detected'}
          </span>
          {metrics.highestDropOffStage && (
            <span
              data-testid="kpi-bottleneck-rate"
              dir="ltr"
              className="text-xs font-semibold text-destructive"
            >
              {`(-${metrics.highestDropOffStage.dropOffPercent}%)`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
