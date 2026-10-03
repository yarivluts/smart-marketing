'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  DollarSign,
  RotateCw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';
import { PageGuideButton } from '@/components/guides/page-guide-button';

export interface FailedChargeQueueItem {
  id: string;
  customerName: string;
  invoiceAmount: string;
  failureReason: string;
  dunningStage: string;
  nextRetry: string;
  retried?: boolean;
}

export interface DailyCollectionRecoveryHubProps {
  orgId?: string;
  projectId?: string;
  isDataConnected?: boolean;
  initialItems?: FailedChargeQueueItem[];
  onRetryCharge?: (id: string) => Promise<void> | void;
}

const DEFAULT_ITEMS: FailedChargeQueueItem[] = [
  {
    id: 'fc-1',
    customerName: 'TechFlow Systems',
    invoiceAmount: '$299.00',
    failureReason: 'insufficient_funds',
    dunningStage: 'Stage 2 (Smart Retry #2)',
    nextRetry: 'Tomorrow at 09:00',
  },
  {
    id: 'fc-2',
    customerName: 'Apex Retail Group',
    invoiceAmount: '$199.00',
    failureReason: 'card_expired',
    dunningStage: 'Stage 1 (Portal Link Sent)',
    nextRetry: 'In 3 days',
  },
  {
    id: 'fc-3',
    customerName: 'Lumina Health Care',
    invoiceAmount: '$650.00',
    failureReason: 'do_not_honor',
    dunningStage: 'Stage 3 (Account Flagged)',
    nextRetry: 'Manual Intervention Required',
  },
];

export function DailyCollectionRecoveryHub({
  orgId = 'demo-org',
  projectId = 'demo-project',
  isDataConnected = true,
  initialItems,
  onRetryCharge,
}: DailyCollectionRecoveryHubProps) {
  const [items, setItems] = useState<FailedChargeQueueItem[]>(initialItems && initialItems.length > 0 ? initialItems : DEFAULT_ITEMS);

  const handleRetryNow = async (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, retried: true } : item))
    );
    if (onRetryCharge) {
      await onRetryCharge(id);
    }
  };

  const content = (
    <div className="space-y-8" data-testid="daily-collection-recovery-hub">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>GrowthOS</span>
            <span>&gt;</span>
            <span className="text-foreground">Billing & Dunning</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Daily Collection & Failed Charge Recovery Hub
            </h1>
            <PageGuideButton pageKey="pulse" />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            Real-time tracking of invoiced collections, algorithmic dunning retry schedules, and involuntary churn prevention.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isDataConnected ? (
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 border border-emerald-500/20">
              Stripe Connected ✓
            </span>
          ) : (
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-600 border border-amber-500/20">
              Billing Disconnected ⚠
            </span>
          )}
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground shadow-sm">
            USD ($)
          </span>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Collected */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <DollarSign className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
              98.2% Collected
            </span>
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Total Collected This Month
          </p>
          <div className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            $198,450
          </div>
          <div className="mt-3 text-xs text-emerald-600 flex items-center gap-1 font-medium">
            <TrendingUp className="h-3.5 w-3.5" /> +14.2% MoM Pacing
          </div>
        </div>

        {/* Failed Charges */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600">
              <CreditCard className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-rose-600">34 attempts</span>
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Failed Recurring Charges
          </p>
          <div className="mt-1 text-3xl font-bold tracking-tight text-rose-600">
            $8,420
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Active dunning cadence
          </div>
        </div>

        {/* Recovered */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <RotateCw className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
              72.9% Rate
            </span>
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Successfully Recovered
          </p>
          <div className="mt-1 text-3xl font-bold tracking-tight text-emerald-600">
            +$6,140
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Saved via smart retry schedules
          </div>
        </div>

        {/* Involuntary Churn Prevented */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600">
              Protection
            </span>
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Involuntary Churn Prevented
          </p>
          <div className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            28 Accounts Saved
          </div>
          <div className="mt-3 text-xs text-blue-600 font-medium">
            +$3,200 MRR preserved
          </div>
        </div>
      </div>

      {/* Daily Collection vs Invoiced Pacing Visual */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-base font-bold tracking-tight text-foreground">
          Daily Collection vs Invoiced Pacing
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Green bars represent cleared funds; red caps indicate initial retry failures.
        </p>

        <div className="mt-6 flex h-48 items-end gap-3 rounded-xl bg-muted/20 p-4">
          {[
            { day: 'Day 1', green: 80, red: 15 },
            { day: 'Day 5', green: 90, red: 5 },
            { day: 'Day 10', green: 75, red: 20 },
            { day: 'Day 15', green: 95, red: 3 },
            { day: 'Day 20', green: 88, red: 10 },
            { day: 'Day 25', green: 94, red: 4 },
            { day: 'Day 30', green: 98, red: 2 },
          ].map((bar) => (
            <div key={bar.day} className="flex flex-1 flex-col items-center gap-1.5 h-full justify-end">
              <div className="w-full max-w-[42px] flex flex-col justify-end">
                <div
                  className="w-full bg-rose-500/70 rounded-t-sm"
                  style={{ height: `${bar.red}%` }}
                />
                <div
                  className="w-full bg-emerald-500 rounded-b-sm"
                  style={{ height: `${bar.green}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{bar.day}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Failed Charges & Smart Dunning Queue Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <h2 className="text-base font-bold tracking-tight text-foreground">
              Failed Charges & Smart Dunning Queue
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Real-time recovery execution queue.
            </p>
          </div>
          <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-bold text-rose-600">
            {items.length} In Dunning
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="py-3.5 px-5 font-semibold">CUSTOMER / ACCOUNT</th>
                <th className="py-3.5 px-4 font-semibold">INVOICE AMOUNT</th>
                <th className="py-3.5 px-4 font-semibold">FAILURE REASON CODE</th>
                <th className="py-3.5 px-4 font-semibold">DUNNING STAGE</th>
                <th className="py-3.5 px-4 font-semibold">NEXT RETRY</th>
                <th className="py-3.5 px-5 font-semibold text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {items.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-muted/40">
                  <td className="py-4 px-5 font-bold text-foreground">{row.customerName}</td>
                  <td className="py-4 px-4 font-mono font-bold text-foreground">{row.invoiceAmount}</td>
                  <td className="py-4 px-4">
                    <span className="rounded bg-rose-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                      {row.failureReason}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-muted-foreground font-medium">{row.dunningStage}</td>
                  <td className="py-4 px-4 text-muted-foreground">{row.nextRetry}</td>
                  <td className="py-4 px-5 text-right">
                    {row.retried ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Retrying...
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRetryNow(row.id)}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                      >
                        ⚡ Retry Now
                      </button>
                    )}
                  </td>
                </tr>
              ))}
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
      metricKey="MRR_WATERFALL"
    >
      {content}
    </MissingIntegrationOverlay>
  );
}
