'use client';

import React, { useState } from 'react';
import { ArrowRight, GitBranch } from 'lucide-react';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';
import { PageGuideButton } from '@/components/guides/page-guide-button';

export interface AttributionChannelRow {
  id: string;
  channel: string;
  role: string;
  firstTouchShare: string;
  firstTouchRevenue: string;
  lastTouchShare: string;
  lastTouchRevenue: string;
  shapleyShare: string;
  shapleyRevenue: string;
  roas: string;
  roasStatus: 'emerald' | 'amber';
  color: string;
}

export interface MultiTouchAttributionMatrixProps {
  orgId?: string;
  projectId?: string;
  isDataConnected?: boolean;
  initialRows?: AttributionChannelRow[];
}

const DEFAULT_ROWS: AttributionChannelRow[] = [
  {
    id: 'meta',
    channel: 'Meta Ads',
    role: 'Top of Funnel & Awareness',
    firstTouchShare: '42%',
    firstTouchRevenue: '$59,800',
    lastTouchShare: '18%',
    lastTouchRevenue: '$25,600',
    shapleyShare: '34%',
    shapleyRevenue: '$48,450',
    roas: '3.92x',
    roasStatus: 'emerald',
    color: 'bg-blue-500',
  },
  {
    id: 'google',
    channel: 'Google Search Ads',
    role: 'High-Intent Decision & Harvest',
    firstTouchShare: '28%',
    firstTouchRevenue: '$39,900',
    lastTouchShare: '58%',
    lastTouchRevenue: '$82,650',
    shapleyShare: '46%',
    shapleyRevenue: '$65,550',
    roas: '4.35x',
    roasStatus: 'emerald',
    color: 'bg-red-500',
  },
  {
    id: 'tiktok',
    channel: 'TikTok UGC',
    role: 'Audience Discovery & Prospecting',
    firstTouchShare: '19%',
    firstTouchRevenue: '$27,000',
    lastTouchShare: '6%',
    lastTouchRevenue: '$8,550',
    shapleyShare: '12%',
    shapleyRevenue: '$17,100',
    roas: '2.10x',
    roasStatus: 'amber',
    color: 'bg-purple-500',
  },
  {
    id: 'organic',
    channel: 'Direct / Organic Referral',
    role: 'Brand Equity & Re-engagement',
    firstTouchShare: '11%',
    firstTouchRevenue: '$15,600',
    lastTouchShare: '18%',
    lastTouchRevenue: '$25,600',
    shapleyShare: '8%',
    shapleyRevenue: '$11,400',
    roas: '8.40x',
    roasStatus: 'emerald',
    color: 'bg-emerald-500',
  },
];

export function MultiTouchAttributionMatrix({
  orgId = 'demo-org',
  projectId = 'demo-project',
  isDataConnected = true,
  initialRows,
}: MultiTouchAttributionMatrixProps) {
  const [rows, setRows] = useState<AttributionChannelRow[]>(initialRows && initialRows.length > 0 ? initialRows : DEFAULT_ROWS);
  const [lookbackDays, setLookbackDays] = useState<'30' | '60' | '90'>('60');
  const [activeModel, setActiveModel] = useState<'shapley' | 'first_touch' | 'last_touch' | 'linear'>('shapley');

  const content = (
    <div className="space-y-8" data-testid="multi-touch-attribution-matrix">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>GrowthOS</span>
            <span>&gt;</span>
            <span className="text-foreground">Attribution & Journey Intelligence</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Multi-Touch Attribution Matrix
            </h1>
            <PageGuideButton pageKey="attribution" />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            Cross-channel Shapley value game-theoretic revenue attribution vs legacy first & last click.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Lookback window */}
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-card p-1 shadow-sm">
            <span className="px-2 text-[10px] font-bold text-muted-foreground uppercase">
              LOOKBACK:
            </span>
            {(['30', '60', '90'] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setLookbackDays(days)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                  lookbackDays === days
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {days} Days
              </button>
            ))}
          </div>

          {/* Model Selector */}
          <select
            value={activeModel}
            onChange={(e) => setActiveModel(e.target.value as 'shapley' | 'first_touch' | 'last_touch' | 'linear')}
            className="rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-foreground shadow-sm focus:outline-none"
          >
            <option value="shapley">Data-Driven (Shapley Values)</option>
            <option value="first_touch">First-Touch Model</option>
            <option value="last_touch">Last-Touch Model</option>
            <option value="linear">Linear Multi-Touch</option>
          </select>
        </div>
      </div>

      {/* Channel Credit Allocation Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold tracking-tight text-foreground">
              Channel Credit Allocation Comparison
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">Total Attributed: $142,500</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="py-3.5 px-5 font-semibold">CHANNEL & FUNNEL ROLE</th>
                <th className="py-3.5 px-4 font-semibold">FIRST-TOUCH</th>
                <th className="py-3.5 px-4 font-semibold">LAST-TOUCH</th>
                <th className="py-3.5 px-4 font-semibold bg-primary/10 text-primary">
                  DATA-DRIVEN (SHAPLEY)
                </th>
                <th className="py-3.5 px-5 font-semibold text-right">BLENDED ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-muted/40">
                  <td className="py-4 px-5">
                    <div className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full ${row.color}`} />
                      <div>
                        <div className="font-bold text-foreground">{row.channel}</div>
                        <div className="text-[11px] text-muted-foreground">{row.role}</div>
                      </div>
                    </div>
                  </td>

                  <td className="py-4 px-4 text-muted-foreground">
                    <span className="font-bold text-foreground">{row.firstTouchShare}</span>{' '}
                    <span className="text-[11px]">({row.firstTouchRevenue})</span>
                  </td>

                  <td className="py-4 px-4 text-muted-foreground">
                    <span className="font-bold text-foreground">{row.lastTouchShare}</span>{' '}
                    <span className="text-[11px]">({row.lastTouchRevenue})</span>
                  </td>

                  <td className="py-4 px-4 bg-primary/5 font-semibold text-primary">
                    <span className="text-sm font-bold">{row.shapleyShare}</span>{' '}
                    <span className="text-xs opacity-80 font-normal">({row.shapleyRevenue})</span>
                  </td>

                  <td className="py-4 px-5 text-right font-mono font-bold text-sm">
                    <span
                      className={
                        row.roasStatus === 'emerald'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }
                    >
                      {row.roas}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Journey Touchpoints Path Visual */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-base font-bold tracking-tight text-foreground">
          Top Converting Omnichannel Journey Pathways
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Multi-touch sequencing showing the most frequent touchpoint paths leading to high-value subscriptions.
        </p>

        <div className="mt-6 space-y-4">
          {/* Path 1 */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-lg bg-blue-500/10 px-2.5 py-1 font-bold text-blue-600">
                Meta Video Ad
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="rounded-lg bg-purple-500/10 px-2.5 py-1 font-bold text-purple-600">
                TikTok UGC Retargeting
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="rounded-lg bg-red-500/10 px-2.5 py-1 font-bold text-red-600">
                Google Brand Search
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 font-bold text-emerald-600">
                Direct Conversion ($199/mo)
              </span>
            </div>
            <div className="text-right text-xs">
              <span className="font-bold text-foreground">342 conversions</span>
              <div className="text-[11px] text-muted-foreground">Avg cycle: 8.4 days</div>
            </div>
          </div>

          {/* Path 2 */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-lg bg-red-500/10 px-2.5 py-1 font-bold text-red-600">
                Google Competitor Search
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="rounded-lg bg-blue-500/10 px-2.5 py-1 font-bold text-blue-600">
                Meta Testimonial Ad
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 font-bold text-emerald-600">
                Enterprise Demo Scheduled ($650/mo)
              </span>
            </div>
            <div className="text-right text-xs">
              <span className="font-bold text-foreground">188 conversions</span>
              <div className="text-[11px] text-muted-foreground">Avg cycle: 14.2 days</div>
            </div>
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
      connectorId="google_ads"
      metricKey="TROI"
    >
      {content}
    </MissingIntegrationOverlay>
  );
}
