'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  DollarSign,
  TrendingDown,
  UserMinus,
} from 'lucide-react';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';

export interface ChurnSurveyItem {
  id: string;
  accountName: string;
  plan: string;
  mrrLost: string;
  tenure: string;
  reasonQuote: string;
  winBackScore: number;
  offered?: boolean;
}

export interface ChurnSurvivalDashboardProps {
  orgId?: string;
  projectId?: string;
  isDataConnected?: boolean;
  initialSurveys?: ChurnSurveyItem[];
  onSendWinBackOffer?: (surveyId: string) => Promise<void> | void;
}

const DEFAULT_SURVEYS: ChurnSurveyItem[] = [
  {
    id: 'c-1',
    accountName: 'Nexus Logistics',
    plan: 'Pro ($199)',
    mrrLost: '-$199',
    tenure: '8 Mo Tenure',
    reasonQuote: 'Budget Consolidation — downsizing seat license count',
    winBackScore: 78,
  },
  {
    id: 'c-2',
    accountName: 'Alpha Design Studio',
    plan: 'Starter ($49)',
    mrrLost: '-$49',
    tenure: '2 Mo Tenure',
    reasonQuote: 'Missing HubSpot two-way contact syncing',
    winBackScore: 45,
  },
  {
    id: 'c-3',
    accountName: 'Cascade Medical Group',
    plan: 'Enterprise ($650)',
    mrrLost: '-$650',
    tenure: '14 Mo Tenure',
    reasonQuote: 'Migrated to all-in-one ERP with built-in e-signature',
    winBackScore: 62,
  },
];

export function ChurnSurvivalDashboard({
  orgId = 'demo-org',
  projectId = 'demo-project',
  isDataConnected = true,
  initialSurveys,
  onSendWinBackOffer,
}: ChurnSurvivalDashboardProps) {
  const [surveys, setSurveys] = useState<ChurnSurveyItem[]>(initialSurveys && initialSurveys.length > 0 ? initialSurveys : DEFAULT_SURVEYS);

  const handleSendOffer = async (id: string) => {
    const survey = surveys.find((s) => s.id === id);
    setSurveys((prev) =>
      prev.map((item) => (item.id === id ? { ...item, offered: true } : item))
    );
    if (onSendWinBackOffer) {
      await onSendWinBackOffer(id);
    } else if (orgId && projectId && orgId !== 'demo-org') {
      try {
        await fetch(`/api/orgs/${orgId}/projects/${projectId}/rep-collections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company: survey?.accountName || 'Churned Account',
            collectionType: 'save',
            amount: 199,
            occurredAt: new Date().toISOString(),
            note: 'Dispatched automated 30% win-back coupon discount offer',
          }),
        });
      } catch (err) {
        console.error('Failed to persist win-back offer', err);
      }
    }
  };

  const content = (
    <div className="space-y-8" data-testid="churn-survival-dashboard">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>GrowthOS</span>
            <span>&gt;</span>
            <span className="text-foreground">Churn Intelligence</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Customer Survival Curves & Churn Diagnostics
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            Empirical Kaplan-Meier survival curves, cohort hazard rates, and exit survey win-back offers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground shadow-sm">
            All Paying Customers
          </span>
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground shadow-sm">
            Self-Serve vs Sales
          </span>
        </div>
      </div>

      {/* 4 Scorecards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Net MRR Churn */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <TrendingDown className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
              Expansion &gt; Churn
            </span>
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Net MRR Churn Rate
          </p>
          <div className="mt-1 text-3xl font-bold tracking-tight text-emerald-600">
            -0.4%
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Net negative churn (expansion engine)
          </div>
        </div>

        {/* Gross MRR Churn */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <DollarSign className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              Benchmark: &lt;2.0%
            </span>
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Gross MRR Churn Rate
          </p>
          <div className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            1.8%
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Within healthy SaaS boundaries
          </div>
        </div>

        {/* Logo Churn */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600">
              <UserMinus className="h-5 w-5" />
            </div>
            <span className="text-xs font-medium text-rose-600">18 lost this mo</span>
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Customer Logo Churn
          </p>
          <div className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            2.1%
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Monthly logo attrition rate
          </div>
        </div>

        {/* 365-Day Retention */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
              Top 10% Tier
            </span>
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            365-Day Retention Rate
          </p>
          <div className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            78.4%
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            1-year cohort survival probability
          </div>
        </div>
      </div>

      {/* Main Charts: Survival Curves (2 cols) & Churn Diagnostics (1 col) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Survival Curves */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm lg:col-span-2">
          <div>
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h2 className="text-base font-bold tracking-tight text-foreground">
                  Customer Survival Probability Over Time (Days 0 to 365)
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Kaplan-Meier hazard trajectory by vintage cohort.
                </p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                Days 0–365
              </span>
            </div>

            {/* Survival Curves Chart */}
            <div className="relative mt-8 h-64 w-full border-b border-l border-border pl-8 pb-6">
              {/* Y Axis Labels */}
              <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[10px] text-muted-foreground pb-6">
                <span>100%</span>
                <span>75%</span>
                <span>50%</span>
                <span>25%</span>
                <span>0%</span>
              </div>

              {/* Day 14 Drop-off Marker */}
              <div
                className="absolute top-0 bottom-6 border-l border-dashed border-border pointer-events-none"
                style={{ left: '18%' }}
              >
                <span className="absolute -top-5 -left-12 rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                  Day 14 Trial End
                </span>
              </div>

              {/* Day 90 Marker */}
              <div
                className="absolute top-0 bottom-6 border-l border-dashed border-border pointer-events-none"
                style={{ left: '45%' }}
              />

              {/* SVG Survival Curves */}
              <svg className="h-full w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                {/* Q4 2024 */}
                <path d="M0,0 Q5,2 10,25 T20,35 T40,40 T80,45 T100,48" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
                {/* Q1 2025 */}
                <path d="M0,0 Q5,2 10,20 T20,30 T40,35 T80,40 T100,42" fill="none" stroke="#c084fc" strokeWidth="2" />
                {/* Q2 2025 */}
                <path d="M0,0 Q5,2 10,18 T20,25 T40,28 T80,32 T100,35" fill="none" stroke="#8b5cf6" strokeWidth="2" />
                {/* Q3 2025 (Latest) */}
                <path d="M0,0 Q5,1 10,12 T20,18 T40,20 T80,22 T100,24" fill="none" stroke="#10b981" strokeWidth="3" />
              </svg>

              {/* X Axis Labels */}
              <div className="absolute bottom-0 left-8 w-[calc(100%-2rem)] flex justify-between text-[10px] text-muted-foreground pt-2">
                <span>Day 0</span>
                <span>Day 14</span>
                <span>Day 30</span>
                <span>Day 90</span>
                <span>Day 180</span>
                <span>Day 365</span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-6 border-t border-border pt-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Q4 2024 (52% retained)
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-purple-400" /> Q1 2025 (58%)
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-purple-600" /> Q2 2025 (65%)
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <strong className="text-foreground">Q3 2025 (76% Best Ever)</strong>
            </div>
          </div>
        </div>

        {/* Churn Diagnostics & Win-Back Offers */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h2 className="text-base font-bold tracking-tight text-foreground">
                  Churn Diagnostics
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Exit surveys & Win-Back potential.
                </p>
              </div>
              <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                Surveys
              </span>
            </div>

            <div className="mt-4 space-y-3.5">
              {surveys.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-border bg-muted/20 p-4 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-foreground">{item.accountName}</h3>
                      <span className="text-[11px] text-muted-foreground">
                        {item.plan} • {item.tenure}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-bold text-rose-600">
                      {item.mrrLost}
                    </span>
                  </div>

                  <div className="mt-2.5 rounded-lg bg-background p-2 text-[11px] italic text-muted-foreground border border-border/50">
                    "{item.reasonQuote}"
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-[10px] text-muted-foreground">Win-Back Score:</span>
                      <span
                        className={`rounded px-1.5 py-0.2 font-bold text-[11px] ${
                          item.winBackScore > 70
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : 'bg-amber-500/10 text-amber-600'
                        }`}
                      >
                        {item.winBackScore}%
                      </span>
                    </div>

                    {item.offered ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> Offer Sent
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSendOffer(item.id)}
                        className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-all"
                      >
                        ⚡ Send Offer
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
            Top exit driver: <strong>Budget Consolidation (42%)</strong>
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
      connectorId="stripe"
      metricKey="CHURN"
    >
      {content}
    </MissingIntegrationOverlay>
  );
}
