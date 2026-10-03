'use client';

import React, { useState } from 'react';
import { ArrowRight, GitBranch, Layers } from 'lucide-react';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';
import { PageGuideButton } from '@/components/guides/page-guide-button';
import {
  PpCard,
  PpKpiGrid,
  PpKpiCard,
  PpEmptyState,
  ppInputClass,
} from '@/components/pastel/primitives';

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

export const DEFAULT_ROWS: AttributionChannelRow[] = [
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
    color: 'bg-pp-primary',
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
    color: 'bg-emerald-500',
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
    color: 'bg-emerald-600',
  },
];

export function MultiTouchAttributionMatrix({
  orgId = 'demo-org',
  projectId = 'demo-project',
  isDataConnected = true,
  initialRows,
}: MultiTouchAttributionMatrixProps) {
  const [rows, setRows] = useState<AttributionChannelRow[]>(
    initialRows !== undefined ? initialRows : DEFAULT_ROWS,
  );
  const [lookbackDays, setLookbackDays] = useState<'30' | '60' | '90'>('60');
  const [activeModel, setActiveModel] = useState<'shapley' | 'first_touch' | 'last_touch' | 'linear'>('shapley');

  const totalAttributedNum = rows.reduce((sum, r) => {
    const num = Number(r.shapleyRevenue.replace(/[^0-9.-]+/g, ''));
    return sum + (isNaN(num) ? 0 : num);
  }, 0);

  const topChannel = rows.length > 0 ? rows[0] : null;

  const content = (
    <div className="space-y-8" data-testid="multi-touch-attribution-matrix">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-label-sm text-label-sm text-pp-outline">
            <span>GrowthOS</span>
            <span>&gt;</span>
            <span className="text-pp-on-surface">Attribution & Journey Intelligence</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <h1 className="font-headline-xl text-headline-xl font-bold tracking-tight text-pp-on-surface">
              Multi-Touch Attribution Matrix
            </h1>
            <PageGuideButton pageKey="attribution" />
          </div>
          <p className="mt-0.5 font-body-sm text-body-sm text-pp-on-surface-variant">
            Cross-channel Shapley value game-theoretic revenue attribution vs legacy first & last click.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Lookback window */}
          <div className="flex items-center gap-1.5 rounded-full border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-1 shadow-xs">
            <span className="px-2 text-[10px] font-bold text-pp-outline uppercase">
              LOOKBACK:
            </span>
            {(['30', '60', '90'] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setLookbackDays(days)}
                className={`rounded-full px-3 py-1 font-label-sm text-label-sm font-semibold transition-all ${
                  lookbackDays === days
                    ? 'bg-pp-primary text-pp-on-primary shadow-xs'
                    : 'text-pp-on-surface-variant hover:text-pp-on-surface'
                }`}
              >
                {days} Days
              </button>
            ))}
          </div>

          {/* Model Selector */}
          <select
            value={activeModel}
            onChange={(e) => setActiveModel(e.target.value as any)}
            className={`rounded-full ${ppInputClass}`}
          >
            <option value="shapley">Data-Driven (Shapley Values)</option>
            <option value="first_touch">First-Touch Model</option>
            <option value="last_touch">Last-Touch Model</option>
            <option value="linear">Linear Multi-Touch</option>
          </select>
        </div>
      </div>

      {/* KPI Cards (Stitch 2bc944e2) */}
      <PpKpiGrid>
        <PpKpiCard
          label="Total Attributed Pipeline"
          value={rows.length > 0 ? `$${totalAttributedNum.toLocaleString()}` : '—'}
          accent="primary"
          badge={rows.length > 0 ? `${lookbackDays}d Window` : 'Standby'}
          badgeAccent={rows.length > 0 ? 'mint' : 'neutral'}
          footer="Multi-touch game-theoretic credit assigned"
        />

        <PpKpiCard
          label="Top Converter Channel"
          value={topChannel ? topChannel.channel : '—'}
          accent="mint"
          badge={topChannel ? topChannel.shapleyRevenue : 'Pending'}
          badgeAccent={topChannel ? 'mint' : 'neutral'}
          footer={topChannel ? topChannel.role : 'Awaiting channel connection'}
        />

        <PpKpiCard
          label="Omni-Assisted Multiplier"
          value={rows.length > 0 ? '2.8x' : '—'}
          valueSuffix={rows.length > 0 ? 'touches/journey' : undefined}
          accent="sky"
          badge={rows.length > 0 ? 'Active Stream' : 'Standby'}
          badgeAccent={rows.length > 0 ? 'sky' : 'neutral'}
          footer="Average multi-channel touches before conversion"
        />

        <PpKpiCard
          label="Incrementality Lift Index"
          value={rows.length > 0 ? '+24.2%' : '—'}
          accent="primary"
          badge={rows.length > 0 ? '98.5% Stat Sig' : 'Standby'}
          badgeAccent={rows.length > 0 ? 'primary' : 'neutral'}
          footer="Geo-verified incrementality lift over organic baseline"
        />
      </PpKpiGrid>

      {/* Channel Credit Allocation Table */}
      <div className="rounded-3xl border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-pp-outline-variant/40 pb-4">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-pp-primary" />
            <h2 className="font-headline-md text-headline-md font-bold tracking-tight text-pp-on-surface">
              Channel Credit Allocation Comparison
            </h2>
          </div>
          <span className="font-label-sm text-label-sm font-semibold text-pp-on-surface-variant">
            {rows.length > 0 ? `Total Attributed: $${totalAttributedNum.toLocaleString()}` : '0 Channels'}
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="py-8">
            <PpEmptyState
              icon={GitBranch}
              title="No attribution events recorded"
              description="Connect your ad channels and tracking pixels to ingest multi-touch conversion events and compute game-theoretic Shapley credit."
            />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-start text-xs border-collapse">
              <thead>
                <tr className="border-b border-pp-outline-variant/40 font-label-sm text-label-sm font-semibold uppercase tracking-wider text-pp-outline">
                  <th className="py-3 px-4 text-start">CHANNEL & FUNNEL ROLE</th>
                  <th className="py-3 px-4 text-start">FIRST-TOUCH</th>
                  <th className="py-3 px-4 text-start">LAST-TOUCH</th>
                  <th className="py-3 px-4 text-start bg-pp-primary-fixed/30 text-pp-primary">
                    DATA-DRIVEN (SHAPLEY)
                  </th>
                  <th className="py-3 px-4 text-end">BLENDED ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pp-outline-variant/30 font-body-sm text-body-sm">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-pp-surface-container-low transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`h-3 w-3 rounded-full ${row.color}`} />
                        <div>
                          <div className="font-bold text-pp-on-surface">{row.channel}</div>
                          <div className="text-[11px] text-pp-on-surface-variant">{row.role}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-4 text-pp-on-surface-variant">
                      <span className="font-bold text-pp-on-surface">{row.firstTouchShare}</span>{' '}
                      <span className="text-[11px]">({row.firstTouchRevenue})</span>
                    </td>

                    <td className="py-4 px-4 text-pp-on-surface-variant">
                      <span className="font-bold text-pp-on-surface">{row.lastTouchShare}</span>{' '}
                      <span className="text-[11px]">({row.lastTouchRevenue})</span>
                    </td>

                    <td className="py-4 px-4 bg-pp-primary-fixed/20 font-semibold text-pp-primary">
                      <span className="text-sm font-bold">{row.shapleyShare}</span>{' '}
                      <span className="text-xs opacity-80 font-normal">({row.shapleyRevenue})</span>
                    </td>

                    <td className="py-4 px-4 text-end font-mono font-bold text-sm">
                      <span
                        className={
                          row.roasStatus === 'emerald'
                            ? 'text-emerald-600'
                            : 'text-amber-600'
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
        )}
      </div>

      {/* Customer Journey Touchpoints Path Visual */}
      <div className="rounded-3xl border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-6 shadow-xs">
        <h2 className="font-headline-md text-headline-md font-bold tracking-tight text-pp-on-surface">
          Top Converting Omnichannel Journey Pathways
        </h2>
        <p className="mt-0.5 font-body-sm text-body-sm text-pp-on-surface-variant">
          Multi-touch sequencing showing the most frequent touchpoint paths leading to high-value subscriptions.
        </p>

        {rows.length === 0 ? (
          <div className="py-8">
            <PpEmptyState
              icon={GitBranch}
              title="No multi-touch conversion pathways"
              description="Omnichannel sequence paths will automatically synthesize as users navigate across your ad touchpoints and website."
            />
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {/* Path 1 */}
            <div className="rounded-2xl border border-pp-outline-variant/40 bg-pp-surface-container-low p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-lg bg-pp-primary-fixed px-2.5 py-1 font-bold text-pp-on-primary-fixed-variant">
                  Meta Video Ad
                </span>
                <ArrowRight className="h-3 w-3 text-pp-outline rtl:rotate-180" />
                <span className="rounded-lg bg-purple-100 px-2.5 py-1 font-bold text-purple-900">
                  TikTok UGC Retargeting
                </span>
                <ArrowRight className="h-3 w-3 text-pp-outline rtl:rotate-180" />
                <span className="rounded-lg bg-amber-100 px-2.5 py-1 font-bold text-amber-900">
                  Google Brand Search
                </span>
                <ArrowRight className="h-3 w-3 text-pp-outline rtl:rotate-180" />
                <span className="rounded-lg bg-emerald-100 px-2.5 py-1 font-bold text-emerald-900">
                  Direct Conversion ($199/mo)
                </span>
              </div>
              <div className="text-right text-xs">
                <span className="font-bold text-pp-on-surface">342 conversions</span>
                <div className="text-[11px] text-pp-on-surface-variant">Avg cycle: 8.4 days</div>
              </div>
            </div>

            {/* Path 2 */}
            <div className="rounded-2xl border border-pp-outline-variant/40 bg-pp-surface-container-low p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-lg bg-amber-100 px-2.5 py-1 font-bold text-amber-900">
                  Google Competitor Search
                </span>
                <ArrowRight className="h-3 w-3 text-pp-outline rtl:rotate-180" />
                <span className="rounded-lg bg-pp-primary-fixed px-2.5 py-1 font-bold text-pp-on-primary-fixed-variant">
                  Meta Testimonial Ad
                </span>
                <ArrowRight className="h-3 w-3 text-pp-outline rtl:rotate-180" />
                <span className="rounded-lg bg-emerald-100 px-2.5 py-1 font-bold text-emerald-900">
                  Enterprise Demo Scheduled ($650/mo)
                </span>
              </div>
              <div className="text-right text-xs">
                <span className="font-bold text-pp-on-surface">188 conversions</span>
                <div className="text-[11px] text-pp-on-surface-variant">Avg cycle: 14.2 days</div>
              </div>
            </div>
          </div>
        )}
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
