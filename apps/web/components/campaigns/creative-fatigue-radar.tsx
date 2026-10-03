'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Image,
  Play,
  RotateCw,
  TrendingUp,
  Video,
} from 'lucide-react';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';

export interface CreativeAsset {
  id: string;
  title: string;
  format: 'meta_video' | 'tiktok_ugc' | 'meta_image';
  roas: string;
  spend: string;
  thumbStopRate: string;
  viewRate3s?: string;
  ctr: string;
  status: 'healthy' | 'fatigued' | 'optimal';
  decayDaysRemaining?: number;
  fatigueWarning?: string;
}

export interface CreativeFatigueRadarProps {
  orgId?: string;
  projectId?: string;
  isDataConnected?: boolean;
  initialAssets?: CreativeAsset[];
  onRotateVariant?: (assetId: string) => Promise<void> | void;
}

const DEFAULT_ASSETS: CreativeAsset[] = [
  {
    id: 'c-asset-1',
    title: 'Lawyer Testimonial 30s',
    format: 'meta_video',
    roas: '4.12x',
    spend: '$4,210',
    thumbStopRate: '38.5%',
    viewRate3s: '46.2%',
    ctr: '2.84%',
    status: 'healthy',
    decayDaysRemaining: 12,
  },
  {
    id: 'c-asset-2',
    title: 'Sign Contracts in Bed',
    format: 'tiktok_ugc',
    roas: '1.84x',
    spend: '$2,400',
    thumbStopRate: '21.4%',
    viewRate3s: '22.1%',
    ctr: '1.20%',
    status: 'fatigued',
    fatigueWarning: 'Fatigued (Freq: 4.8x) • CPA surged +42%',
  },
  {
    id: 'c-asset-3',
    title: '3-Step Workflow Diagram',
    format: 'meta_image',
    roas: '3.45x',
    spend: '$3,150',
    thumbStopRate: '32.0%',
    ctr: '3.10%',
    status: 'optimal',
    decayDaysRemaining: 24,
  },
];

export function CreativeFatigueRadar({
  orgId = 'demo-org',
  projectId = 'demo-project',
  isDataConnected = true,
  initialAssets,
  onRotateVariant,
}: CreativeFatigueRadarProps) {
  const [assets, setAssets] = useState<CreativeAsset[]>(initialAssets && initialAssets.length > 0 ? initialAssets : DEFAULT_ASSETS);
  const [swappedId, setSwappedId] = useState<string | null>(null);

  const handleSwap = async (assetId: string) => {
    setAssets((prev) =>
      prev.map((a) =>
        a.id === assetId
          ? {
              ...a,
              status: 'healthy',
              title: 'Hook #07: Fast Signing (Variant C)',
              roas: '3.60x',
              fatigueWarning: undefined,
              decayDaysRemaining: 28,
            }
          : a
      )
    );
    setSwappedId(assetId);
    setTimeout(() => setSwappedId(null), 3000);

    if (onRotateVariant) {
      await onRotateVariant(assetId);
    } else if (orgId && projectId && orgId !== 'demo-org') {
      try {
        await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/actions/campaign-activations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId: assetId }),
        });
      } catch (err) {
        console.error('Failed to trigger creative rotation', err);
      }
    }
  };

  const content = (
    <div className="space-y-8" data-testid="creative-fatigue-radar">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>GrowthOS</span>
            <span>&gt;</span>
            <span className="text-foreground">Creative Intelligence</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Creative Asset Performance & Fatigue Radar
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            Real-time algorithmic detection of creative wear-out, frequency saturation, and 1-click variant swaps.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-600">
            1 Creative Fatigued
          </span>
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600">
            2 Top Performers
          </span>
        </div>
      </div>

      {/* Asset Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className={`flex flex-col justify-between overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:shadow-md ${
              asset.status === 'fatigued'
                ? 'border-rose-500/40 bg-rose-500/5'
                : 'border-border'
            }`}
          >
            {/* Visual Thumbnail / Header */}
            <div className="relative h-44 bg-muted/40 p-4 flex flex-col justify-between overflow-hidden">
              <div className="flex items-center justify-between z-10">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-md">
                  {asset.format === 'meta_video' && <Video className="h-3 w-3" />}
                  {asset.format === 'tiktok_ugc' && <Play className="h-3 w-3" />}
                  {asset.format === 'meta_image' && <Image className="h-3 w-3" />}
                  {asset.format === 'meta_video'
                    ? 'Meta Video'
                    : asset.format === 'tiktok_ugc'
                    ? 'TikTok UGC'
                    : 'Meta Image'}
                </span>

                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold shadow-sm ${
                    asset.status === 'fatigued'
                      ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                      : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  <TrendingUp className="h-3 w-3" />
                  {asset.roas} ROAS
                </span>
              </div>

              {/* Background gradient motif */}
              <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent pointer-events-none" />

              <div className="z-10 mt-auto">
                <h2 className="text-sm font-bold text-foreground">{asset.title}</h2>
                <div className="text-xs text-muted-foreground">
                  Spend: <strong className="text-foreground">{asset.spend}</strong>
                </div>
              </div>
            </div>

            {/* Metrics Breakdown */}
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-muted/40 p-2.5">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                    Thumb-Stop
                  </span>
                  <div className="text-base font-bold text-foreground">
                    {asset.thumbStopRate}
                  </div>
                </div>

                {asset.viewRate3s ? (
                  <div className="rounded-xl bg-muted/40 p-2.5">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                      3s View Rate
                    </span>
                    <div className="text-base font-bold text-foreground">
                      {asset.viewRate3s}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl bg-muted/40 p-2.5">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                      Outbound CTR
                    </span>
                    <div className="text-base font-bold text-foreground">{asset.ctr}</div>
                  </div>
                )}
              </div>

              {/* Status & Actions */}
              {asset.status === 'fatigued' ? (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    <span className="text-xs font-bold text-rose-700 dark:text-rose-300">
                      {asset.fatigueWarning}
                    </span>
                  </div>

                  {swappedId === asset.id ? (
                    <div className="flex items-center justify-center gap-1.5 py-1 text-xs font-bold text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> Swapped with Hook #07!
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSwap(asset.id)}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 transition-colors"
                    >
                      <RotateCw className="h-3.5 w-3.5" /> Swap with Hook #07
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-600">
                      {asset.status === 'healthy' ? 'Healthy Performance' : 'Optimal Roas'}
                    </span>
                    <span className="text-muted-foreground">
                      {asset.decayDaysRemaining} days to decay
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.min(100, (asset.decayDaysRemaining || 10) * 4)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <MissingIntegrationOverlay
      orgId={orgId}
      projectId={projectId}
      isMissing={!isDataConnected}
      connectorId="meta_ads"
      metricKey="ROI"
    >
      {content}
    </MissingIntegrationOverlay>
  );
}
