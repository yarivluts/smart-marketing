'use client';

import React, { useState } from 'react';
import { CheckCircle2, ExternalLink, Pause } from 'lucide-react';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';
import { VisualDomStudio } from './visual-dom-studio';

export interface ExperimentRow {
  id: string;
  name: string;
  targetUrl: string;
  status: 'live' | 'paused' | 'concluded';
  testType: string;
  trafficSplit: string;
  sampleSize: string;
  convLift: string;
  confidence: string;
  netProfit: string;
  deployedWinner?: boolean;
}

export interface ExperimentRegistryDashboardProps {
  orgId?: string;
  projectId?: string;
  isDataConnected?: boolean;
}

const DEFAULT_EXPERIMENTS: ExperimentRow[] = [
  {
    id: 'exp-1',
    name: 'Pricing Page - 30-Sec Signing Guarantee',
    targetUrl: 'easysign.io/pricing',
    status: 'live',
    testType: 'A/B Test',
    trafficSplit: '50/50',
    sampleSize: '21,050',
    convLift: '+17.9%',
    confidence: '98.4%',
    netProfit: '+$12,400',
  },
  {
    id: 'exp-2',
    name: 'Legal Landing Page - Testimonial Video Hook',
    targetUrl: 'easysign.io/legal',
    status: 'live',
    testType: 'Personalization (Meta)',
    trafficSplit: '60/40',
    sampleSize: '14,200',
    convLift: '+24.1%',
    confidence: '99.1%',
    netProfit: '+$8,900',
  },
  {
    id: 'exp-3',
    name: 'Checkout Button Color & Copy',
    targetUrl: 'easysign.io/checkout',
    status: 'paused',
    testType: 'A/B Test',
    trafficSplit: '50/50',
    sampleSize: '6,400',
    convLift: '-2.1%',
    confidence: '41.2%',
    netProfit: '-$420',
  },
  {
    id: 'exp-4',
    name: 'Homepage Hero Headline - Zero Setup',
    targetUrl: 'easysign.io/home',
    status: 'concluded',
    testType: 'A/B Test',
    trafficSplit: '100% Winner',
    sampleSize: '45,000',
    convLift: '+12.4%',
    confidence: '100%',
    netProfit: '+$19,800',
    deployedWinner: true,
  },
];

export function ExperimentRegistryDashboard({
  orgId = 'demo-org',
  projectId = 'demo-project',
  isDataConnected = true,
}: ExperimentRegistryDashboardProps) {
  const [experiments, setExperiments] = useState<ExperimentRow[]>(DEFAULT_EXPERIMENTS);
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'paused' | 'concluded'>('all');
  const [isStudioOpen, setIsStudioOpen] = useState(false);

  const handleDeployWinner = (id: string) => {
    setExperiments((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              status: 'concluded',
              trafficSplit: '100% Winner',
              deployedWinner: true,
            }
          : e
      )
    );
  };

  const filtered = experiments.filter((e) =>
    statusFilter === 'all' ? true : e.status === statusFilter
  );

  const content = (
    <div className="space-y-8" data-testid="experiment-registry-dashboard">
      {/* Visual DOM Studio Modal */}
      {isStudioOpen && (
        <VisualDomStudio isOpen={isStudioOpen} onClose={() => setIsStudioOpen(false)} orgId={orgId} projectId={projectId} />
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>GrowthOS</span>
            <span>&gt;</span>
            <span className="text-foreground">Client-Side Experimentation</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Experiment Registry & A/B Testing Hub
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            Bayesian & frequentist statistical engine with zero script latency overhead and instant 100% traffic winner deployment.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsStudioOpen(true)}
            className="rounded-full border border-primary bg-primary/10 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition-colors shadow-sm"
          >
            ⚡ Launch Visual Editor
          </button>
        </div>
      </div>

      {/* MTU Usage Hero Card */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex-1 space-y-3 w-full">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">
              42,100 / 100,000 MTUs Used this Billing Cycle
            </h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
              42.1%
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: '42.1%' }} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Free Sandbox / Tier 1 Plan</span>
            <span>18 days remaining in cycle • 0ms render latency</span>
          </div>
        </div>
      </div>

      {/* Status Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {(['all', 'live', 'paused', 'concluded'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition-all ${
              statusFilter === s
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'border border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            {s === 'all' ? 'All Tests (4)' : s}
          </button>
        ))}
      </div>

      {/* Experiment Registry Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="py-3.5 px-5 font-semibold">STATUS</th>
                <th className="py-3.5 px-4 font-semibold">EXPERIMENT & TARGET URL</th>
                <th className="py-3.5 px-3 font-semibold">TEST TYPE</th>
                <th className="py-3.5 px-3 font-semibold">TRAFFIC SPLIT</th>
                <th className="py-3.5 px-3 font-semibold">MTU SAMPLE</th>
                <th className="py-3.5 px-3 font-semibold">CONV. LIFT</th>
                <th className="py-3.5 px-3 font-semibold">CONFIDENCE</th>
                <th className="py-3.5 px-3 font-semibold">NET PROFIT</th>
                <th className="py-3.5 px-5 font-semibold text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-muted/40">
                  <td className="py-4 px-5">
                    {row.status === 'live' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
                      </span>
                    )}
                    {row.status === 'paused' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-600">
                        <Pause className="h-3 w-3" /> PAUSED
                      </span>
                    )}
                    {row.status === 'concluded' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                        <CheckCircle2 className="h-3 w-3" /> CONCLUDED
                      </span>
                    )}
                  </td>

                  <td className="py-4 px-4">
                    <div className="font-bold text-foreground">{row.name}</div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <ExternalLink className="h-3 w-3" /> {row.targetUrl}
                    </div>
                  </td>

                  <td className="py-4 px-3 text-muted-foreground">{row.testType}</td>
                  <td className="py-4 px-3 font-medium text-foreground">{row.trafficSplit}</td>
                  <td className="py-4 px-3 text-muted-foreground">{row.sampleSize}</td>

                  <td className="py-4 px-3">
                    <span
                      className={`font-bold font-mono ${
                        row.convLift.startsWith('+') ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {row.convLift}
                    </span>
                  </td>

                  <td className="py-4 px-3 font-semibold text-foreground">{row.confidence}</td>
                  <td className="py-4 px-3 font-bold font-mono text-emerald-600">{row.netProfit}</td>

                  <td className="py-4 px-5 text-right">
                    {row.deployedWinner ? (
                      <span className="text-[11px] italic text-muted-foreground">
                        Deployed 100%
                      </span>
                    ) : row.status === 'live' ? (
                      <button
                        type="button"
                        onClick={() => handleDeployWinner(row.id)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
                      >
                        ⚡ Deploy Winner (100%)
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Archive</span>
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
      connectorId="growthos_sdk"
      metricKey="CONVERSION_FUNNEL"
    >
      {content}
    </MissingIntegrationOverlay>
  );
}
