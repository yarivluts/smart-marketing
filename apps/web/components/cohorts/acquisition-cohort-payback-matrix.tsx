'use client';

import React, { useState } from 'react';
import {
  Clock,
  DollarSign,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';
import { PageGuideButton } from '@/components/guides/page-guide-button';

export interface CohortPaybackRow {
  cohort: string;
  signups: string;
  paidAccounts: string;
  paidShare: string;
  spend: string;
  cac: string;
  totalCollected: string;
  m0: number;
  m1: number;
  m2: number;
  m3: number;
  m6: number;
  m12: number;
  m24: number;
}

export interface AcquisitionCohortPaybackMatrixProps {
  orgId?: string;
  projectId?: string;
  isDataConnected?: boolean;
  initialCohorts?: CohortPaybackRow[];
}

const DEFAULT_COHORTS: CohortPaybackRow[] = [
  {
    cohort: 'Jan 2024',
    signups: '1,240',
    paidAccounts: '85',
    paidShare: '6.8%',
    spend: '$12,400',
    cac: '$145',
    totalCollected: '$68,200',
    m0: 12,
    m1: 45,
    m2: 88,
    m3: 115,
    m6: 180,
    m12: 340,
    m24: 542,
  },
  {
    cohort: 'Feb 2024',
    signups: '1,420',
    paidAccounts: '102',
    paidShare: '7.2%',
    spend: '$14,100',
    cac: '$138',
    totalCollected: '$74,800',
    m0: 15,
    m1: 52,
    m2: 94,
    m3: 122,
    m6: 195,
    m12: 365,
    m24: 528,
  },
  {
    cohort: 'Mar 2024',
    signups: '1,650',
    paidAccounts: '124',
    paidShare: '7.5%',
    spend: '$16,200',
    cac: '$131',
    totalCollected: '$82,400',
    m0: 16,
    m1: 58,
    m2: 102,
    m3: 135,
    m6: 210,
    m12: 390,
    m24: 510,
  },
  {
    cohort: 'Apr 2024',
    signups: '1,890',
    paidAccounts: '148',
    paidShare: '7.8%',
    spend: '$18,500',
    cac: '$125',
    totalCollected: '$88,900',
    m0: 18,
    m1: 64,
    m2: 112,
    m3: 144,
    m6: 228,
    m12: 415,
    m24: 480,
  },
];

export function AcquisitionCohortPaybackMatrix({
  orgId = 'demo-org',
  projectId = 'demo-project',
  isDataConnected = true,
  initialCohorts,
}: AcquisitionCohortPaybackMatrixProps) {
  const [cohorts, setCohorts] = useState<CohortPaybackRow[]>(initialCohorts && initialCohorts.length > 0 ? initialCohorts : DEFAULT_COHORTS);
  const [timeframe, setTimeframe] = useState<'24m' | '12m' | 'ytd'>('24m');
  const [channel, setChannel] = useState<'all' | 'paid_search' | 'paid_social'>('all');

  const content = (
    <div className="space-y-8" data-testid="acquisition-cohort-payback-matrix">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>GrowthOS</span>
            <span>&gt;</span>
            <span className="text-foreground">Acquisition Economics</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              12/24-Month Acquisition Cohort & Payback Return Matrix
            </h1>
            <PageGuideButton pageKey="cohorts" />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            Comprehensive analysis tracking initial ad spend against cash revenue maturation across monthly cohorts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as '24m' | '12m' | 'ytd')}
            className="rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground shadow-sm"
          >
            <option value="24m">24 Months Rolling</option>
            <option value="12m">12 Months Rolling</option>
            <option value="ytd">YTD Payback</option>
          </select>

          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as 'all' | 'paid_search' | 'paid_social')}
            className="rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground shadow-sm"
          >
            <option value="all">All Marketing Channels</option>
            <option value="paid_search">Paid Search (Google)</option>
            <option value="paid_social">Paid Social (Meta + TikTok)</option>
          </select>
        </div>
      </div>

      {/* 4 Scorecards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Spend */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <DollarSign className="h-5 w-5" />
            </div>
            <span className="text-xs text-muted-foreground">Historical Paid</span>
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Total Marketing Spend
          </p>
          <div className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            $142,800
          </div>
          <div className="mt-3 text-xs text-muted-foreground">Initial acquisition cost</div>
        </div>

        {/* Total Cash Collected */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
              4.16x ROI
            </span>
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Total Cash Collected
          </p>
          <div className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            $594,200
          </div>
          <div className="mt-3 text-xs text-emerald-600 font-medium">
            Cumulative cohort revenue
          </div>
        </div>

        {/* Avg Breakeven */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600">
              <Clock className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-600">
              &lt; 90 Days
            </span>
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Avg Breakeven Month
          </p>
          <div className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            Month 2.8
          </div>
          <div className="mt-3 text-xs text-muted-foreground">Payback velocity milestone</div>
        </div>

        {/* M24 Cumulative Return */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600">
              Compounding LTV
            </span>
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Month 24 Cumulative Return
          </p>
          <div className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            542%
          </div>
          <div className="mt-3 text-xs text-blue-600 font-medium">+5.42x Cash Multiplier</div>
        </div>
      </div>

      {/* Cohort Maturation Matrix Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="text-base font-bold tracking-tight text-foreground">
            Cohort Maturation Detail & Cash Payback (% Returned of Initial CAC)
          </h2>
          <span className="text-xs text-muted-foreground">Green values &gt;= 100% indicate breakeven achieved</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="py-3 px-4 font-semibold">COHORT</th>
                <th className="py-3 px-3 font-semibold">SIGNUPS</th>
                <th className="py-3 px-3 font-semibold">PAID</th>
                <th className="py-3 px-3 font-semibold">% PAID</th>
                <th className="py-3 px-3 font-semibold">SPEND</th>
                <th className="py-3 px-3 font-semibold">CAC</th>
                <th className="py-3 px-3 font-semibold border-r border-border">TOTAL REVENUE</th>
                <th className="py-3 px-3 font-semibold text-center w-14">M0</th>
                <th className="py-3 px-3 font-semibold text-center w-14">M1</th>
                <th className="py-3 px-3 font-semibold text-center w-14">M2</th>
                <th className="py-3 px-3 font-semibold text-center w-14">M3</th>
                <th className="py-3 px-3 font-semibold text-center w-14">M6</th>
                <th className="py-3 px-3 font-semibold text-center w-14">M12</th>
                <th className="py-3 px-3 font-semibold text-center w-14">M24</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {cohorts.map((row) => (
                <tr key={row.cohort} className="transition-colors hover:bg-muted/40">
                  <td className="py-3.5 px-4 font-bold text-foreground">{row.cohort}</td>
                  <td className="py-3.5 px-3">{row.signups}</td>
                  <td className="py-3.5 px-3 font-semibold text-foreground">{row.paidAccounts}</td>
                  <td className="py-3.5 px-3 text-muted-foreground">{row.paidShare}</td>
                  <td className="py-3.5 px-3">{row.spend}</td>
                  <td className="py-3.5 px-3 font-semibold text-foreground">{row.cac}</td>
                  <td className="py-3.5 px-3 font-bold text-foreground border-r border-border">
                    {row.totalCollected}
                  </td>

                  {[row.m0, row.m1, row.m2, row.m3, row.m6, row.m12, row.m24].map((val, idx) => (
                    <td key={idx} className="py-2.5 px-2 text-center">
                      <div
                        className={`rounded-lg py-1.5 px-2 font-mono font-bold text-xs ${
                          val >= 100
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-purple-500/10 text-purple-700 dark:text-purple-300'
                        }`}
                      >
                        {val}%
                      </div>
                    </td>
                  ))}
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
      metricKey="BREAKEVEN"
    >
      {content}
    </MissingIntegrationOverlay>
  );
}
