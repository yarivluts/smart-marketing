'use client';

import React from 'react';
import { ArrowDownRight, CheckCircle2, TrendingDown, Users } from 'lucide-react';
import type { FunnelStep } from './funnel-types';

export interface FunnelStepCardProps {
  step: FunnelStep;
  isFirst?: boolean;
  isLast?: boolean;
  isHighestDropOff?: boolean;
  isSelected?: boolean;
  onSelect?: (step: FunnelStep) => void;
  className?: string;
}

export function FunnelStepCard({
  step,
  isFirst = false,
  isLast = false,
  isHighestDropOff = false,
  isSelected = false,
  onSelect,
  className = '',
}: FunnelStepCardProps): React.ReactElement {
  return (
    <div
      data-testid={`funnel-step-${step.stageKey}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(step)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.(step);
        }
      }}
      className={`group relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-200 cursor-pointer ${
        isSelected
          ? 'border-primary ring-2 ring-primary/20 bg-card shadow-md'
          : isHighestDropOff
            ? 'border-amber-300/80 bg-amber-50/20 dark:border-amber-800/50 dark:bg-amber-950/10 shadow-xs hover:border-amber-400'
            : 'border-border/80 bg-card hover:border-border hover:shadow-xs'
      } ${className}`}
    >
      {/* Top Row: Stage Step Number & Status Indicator */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors ${
              isLast
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : isHighestDropOff
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  : 'bg-primary/10 text-primary'
            }`}
          >
            <span dir="ltr">{step.stepOrder}</span>
          </div>
          <span className="font-semibold text-sm text-foreground truncate">{step.stageLabel}</span>
        </div>

        {isLast ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            <span>Converted</span>
          </span>
        ) : isHighestDropOff ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
            <TrendingDown className="h-3 w-3" />
            <span>Bottleneck</span>
          </span>
        ) : null}
      </div>

      {/* Metric Counts */}
      <div className="mt-3 flex items-baseline justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5 text-muted-foreground/70" />
          <span data-testid={`count-${step.stageKey}`} dir="ltr" className="font-semibold text-foreground">
            {step.customerCount.toLocaleString()} users
          </span>
        </div>
        <span
          data-testid={`pct-${step.stageKey}`}
          dir="ltr"
          className="text-base font-bold text-foreground"
        >
          {`${step.conversionPercent}%`}
        </span>
      </div>

      {/* Animated Visual Fill Bar */}
      <div className="mt-2 h-2.5 w-full rounded-full bg-muted/80 overflow-hidden">
        <div
          data-testid={`bar-${step.stageKey}`}
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            isLast
              ? 'bg-emerald-500'
              : isHighestDropOff
                ? 'bg-amber-500'
                : 'bg-primary'
          }`}
          style={{ width: `${Math.max(3, Math.min(100, step.conversionPercent))}%` }}
        />
      </div>

      {/* Bottom Drop-off Indicator */}
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>vs. Step 1</span>
        {!isFirst ? (
          <div
            data-testid={`dropoff-${step.stageKey}`}
            className="inline-flex items-center gap-0.5 font-medium text-destructive"
            dir="ltr"
          >
            <ArrowDownRight className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{`-${step.dropOffPercent}% drop-off`}</span>
          </div>
        ) : (
          <span className="font-medium text-emerald-600 dark:text-emerald-400">Baseline (100%)</span>
        )}
      </div>
    </div>
  );
}
