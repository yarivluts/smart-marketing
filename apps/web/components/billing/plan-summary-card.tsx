'use client';

import React from 'react';
import { Sparkles, Zap } from 'lucide-react';
import type { BillingPlanSummary } from './billing-types';
import { Button } from '@/components/ui/button';

export interface PlanSummaryCardProps {
  plan?: BillingPlanSummary;
  onUpgrade?: () => void;
  className?: string;
}

export const DEFAULT_PLAN_SUMMARY: BillingPlanSummary = {
  tierName: 'Growth Scale Enterprise',
  priceMonthly: 799,
  currency: 'USD',
  billingInterval: 'monthly',
  renewalDate: '2026-09-30',
  seatUsage: { current: 14, max: 25 },
  eventUsage: { current: 842000, max: 1000000 },
  apiUsage: { current: 48900, max: 100000 },
};

export function PlanSummaryCard({
  plan = DEFAULT_PLAN_SUMMARY,
  onUpgrade,
  className = '',
}: PlanSummaryCardProps): React.ReactElement {
  const seatPct = Math.round((plan.seatUsage.current / plan.seatUsage.max) * 100);
  const eventPct = Math.round((plan.eventUsage.current / plan.eventUsage.max) * 100);
  const apiPct = Math.round((plan.apiUsage.current / plan.apiUsage.max) * 100);

  return (
    <div
      data-testid="plan-summary-card"
      className={`flex flex-col justify-between gap-6 rounded-2xl border border-border/80 bg-card p-6 shadow-xs ${className}`}
    >
      {/* Top Details Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
              <Zap className="h-3.5 w-3.5" />
              <span>Current Plan</span>
            </span>
            <h3 className="text-xl font-bold tracking-tight text-foreground">{plan.tierName}</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Next renewal on <strong className="text-foreground" dir="ltr">{plan.renewalDate}</strong> ($
            {plan.priceMonthly}/{plan.billingInterval})
          </p>
        </div>

        <Button
          type="button"
          data-testid="upgrade-plan-btn"
          onClick={onUpgrade}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold shrink-0 cursor-pointer"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Upgrade Tier</span>
        </Button>
      </div>

      {/* Usage Meters Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-border/60">
        {/* Seats */}
        <div className="flex flex-col gap-1.5 text-xs">
          <div className="flex justify-between font-medium">
            <span className="text-muted-foreground">Team Seats</span>
            <span className="font-bold text-foreground" dir="ltr">
              {plan.seatUsage.current} / {plan.seatUsage.max} ({seatPct}%)
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full ${seatPct > 80 ? 'bg-amber-500' : 'bg-primary'}`}
              style={{ width: `${seatPct}%` }}
            />
          </div>
        </div>

        {/* Events */}
        <div className="flex flex-col gap-1.5 text-xs">
          <div className="flex justify-between font-medium">
            <span className="text-muted-foreground">Monthly Events</span>
            <span className="font-bold text-foreground" dir="ltr">
              {(plan.eventUsage.current / 1000).toFixed(0)}k / {(plan.eventUsage.max / 1000).toFixed(0)}k
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full ${eventPct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${eventPct}%` }}
            />
          </div>
        </div>

        {/* API Calls */}
        <div className="flex flex-col gap-1.5 text-xs">
          <div className="flex justify-between font-medium">
            <span className="text-muted-foreground">API Syncs</span>
            <span className="font-bold text-foreground" dir="ltr">
              {(plan.apiUsage.current / 1000).toFixed(0)}k / {(plan.apiUsage.max / 1000).toFixed(0)}k
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: `${apiPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
