'use client';

import React from 'react';
import { DollarSign } from 'lucide-react';
import type { PaybackVelocityItem } from './goal-types';

export interface PaybackVelocityCardProps {
  windows?: PaybackVelocityItem[];
  className?: string;
}

export const DEFAULT_PAYBACK_WINDOWS: PaybackVelocityItem[] = [
  { windowDays: 7, collectedRevenue: 12400, targetRevenue: 10000, pacePercent: 100 },
  { windowDays: 14, collectedRevenue: 24800, targetRevenue: 22000, pacePercent: 100 },
  { windowDays: 30, collectedRevenue: 38900, targetRevenue: 36000, pacePercent: 100 },
  { windowDays: 40, collectedRevenue: 48200, targetRevenue: 48000, pacePercent: 100 },
];

export function PaybackVelocityCard({
  windows = DEFAULT_PAYBACK_WINDOWS,
  className = '',
}: PaybackVelocityCardProps): React.ReactElement {

  return (
    <div
      data-testid="payback-velocity-card"
      className={`flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-6 shadow-xs ${className}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-foreground">Customer Payback Velocity</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cumulative collected cash recovery across 7d, 14d, 30d, and 40d windows.
          </p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <DollarSign className="h-4 w-4" />
        </div>
      </div>

      <div className="flex flex-col gap-3.5 pt-2">
        {windows.map((w) => (
          <div key={w.windowDays} className="flex flex-col gap-1.5 text-xs">
            <div className="flex justify-between font-medium">
              <span className="text-foreground font-semibold">Day {w.windowDays} Window</span>
              <span className="font-bold text-foreground" dir="ltr">
                ${w.collectedRevenue.toLocaleString()}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted/80 overflow-hidden shadow-inner">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${Math.min(100, Math.max(5, w.pacePercent))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
