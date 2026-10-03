'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PpCard, PpButton, ppInputClass, PpPill, PpEmptyState } from '@/components/pastel/primitives';
import {
  Video,
  Play,
  Pause,
  Download,
  Share2,
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
  RefreshCw,
  FileVideo,
  Settings,
  ShieldCheck,
  Check,
  Copy,
} from 'lucide-react';

interface VideoExportConsoleProps {
  orgId: string;
  projectId: string;
  projectName: string;
}

interface RenderJobItem {
  id: string;
  format: string;
  aspectRatio: string;
  resolution: string;
  duration: string;
  fileSize: string;
  status: 'completed' | 'encoding' | 'synced';
  timestamp: string;
}

export function VideoExportConsole({ orgId, projectId, projectName }: VideoExportConsoleProps): React.ReactElement {
  const t = useTranslations('AdStudioPage');

  const [activeAspectRatio, setActiveAspectRatio] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [isPlaying, setIsPlaying] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [bilingualCaptions, setBilingualCaptions] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);
  const [metaSyncStatus, setMetaSyncStatus] = useState<'synced' | 'pending' | 'syncing'>('synced');
  const [googleSyncStatus, setGoogleSyncStatus] = useState<'synced' | 'pending' | 'syncing'>('synced');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [jobs, setJobs] = useState<RenderJobItem[]>([]);

  const handleStartExport = () => {
    setIsExporting(true);
    setExportComplete(false);

    setTimeout(() => {
      setIsExporting(false);
      setExportComplete(true);
      const newJob: RenderJobItem = {
        id: `JOB-${Date.now().toString().slice(-4)}`,
        format: activeAspectRatio === '9:16' ? 'Vertical Reels' : activeAspectRatio === '1:1' ? 'Square Feed' : 'Landscape Web',
        aspectRatio: activeAspectRatio,
        resolution: activeAspectRatio === '9:16' ? '1080x1920' : activeAspectRatio === '1:1' ? '1080x1080' : '1920x1080',
        duration: '00:30',
        fileSize: '41.5 MB',
        status: 'completed',
        timestamp: 'Just now',
      };
      setJobs((prev) => [newJob, ...prev]);
    }, 1200);
  };

  const handleSyncMeta = () => {
    setMetaSyncStatus('syncing');
    setTimeout(() => {
      setMetaSyncStatus('synced');
    }, 800);
  };

  const handleSyncGoogle = () => {
    setGoogleSyncStatus('syncing');
    setTimeout(() => {
      setGoogleSyncStatus('synced');
    }, 800);
  };

  const copyJobCdn = (id: string) => {
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Pipeline Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Video className="h-6 w-6 text-pp-primary" />
            <h2 className="font-headline-md text-headline-md font-bold text-pp-on-surface">
              {t('exportTitle')}
            </h2>
          </div>
          <p className="mt-1 font-body-sm text-body-sm text-pp-on-surface-variant">
            {t('exportSubtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-label-sm text-label-sm font-bold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Render Engine Active (v2.8)</span>
          </span>
          <button
            type="button"
            onClick={handleStartExport}
            disabled={isExporting}
            className="inline-flex items-center gap-2 rounded-full bg-pp-primary px-6 py-2.5 font-label-sm text-label-sm font-bold text-pp-on-primary shadow-xs transition-all hover:bg-pp-primary-container disabled:opacity-50"
          >
            {isExporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            <span>{isExporting ? t('btnRendering') : t('btnRenderExport')}</span>
          </button>
        </div>
      </div>

      {exportComplete && (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-300 bg-emerald-50 p-4 font-body-sm text-body-sm font-semibold text-emerald-800 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <span>{t('exportSuccess')}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportComplete(false)}
            className="text-xs text-emerald-800 underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Grid: Viewport Preview Player (Left) & Export Settings / Matrix (Right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Viewport Preview Player (5 Cols) */}
        <div className="flex flex-col rounded-3xl border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-6 shadow-xs lg:col-span-5">
          <div className="flex items-center justify-between border-b border-pp-outline-variant/40 pb-4">
            <h3 className="font-headline-md text-headline-md font-bold text-pp-on-surface">
              {t('renderPreviewTitle')}
            </h3>

            {/* Aspect Ratio Toggle Pills */}
            <div className="flex items-center rounded-full bg-pp-surface-container p-1">
              {(['9:16', '1:1', '16:9'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setActiveAspectRatio(r)}
                  className={`rounded-full px-2.5 py-0.5 font-label-sm text-label-sm font-bold transition-all ${
                    activeAspectRatio === r
                      ? 'bg-pp-primary text-pp-on-primary'
                      : 'text-pp-on-surface-variant hover:text-pp-on-surface'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Player Viewport Mockup */}
          <div className="my-6 flex flex-1 items-center justify-center">
            <div
              className={`relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-pp-inverse-surface to-slate-800 p-4 text-white shadow-xl transition-all duration-300 ${
                activeAspectRatio === '9:16'
                  ? 'h-[360px] w-[202px]'
                  : activeAspectRatio === '1:1'
                  ? 'h-[280px] w-[280px]'
                  : 'h-[200px] w-[355px]'
              }`}
            >
              {/* Header Badges */}
              <div className="flex items-center justify-between text-[10px]">
                <span className="rounded bg-black/50 px-1.5 py-0.5 font-bold uppercase tracking-wide">
                  {activeAspectRatio}
                </span>
                <span className="font-mono text-white/80">00:18 / 00:30</span>
              </div>

              {/* Center Play Indicator */}
              <div className="flex flex-col items-center justify-center">
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-md transition-transform hover:scale-110"
                >
                  {isPlaying ? (
                    <Pause className="h-5 w-5 text-white" />
                  ) : (
                    <Play className="h-5 w-5 ms-0.5 text-white" />
                  )}
                </button>
              </div>

              {/* Captions Overlay */}
              {captionsEnabled && (
                <div className="rounded-lg bg-black/60 p-2 text-center text-[11px] font-bold leading-tight backdrop-blur-sm">
                  &ldquo;Cut your CAC payback down to 4.2 months with autonomous telemetry.&rdquo;
                </div>
              )}
            </div>
          </div>

          {/* Timecode & Scrubber Bar */}
          <div className="space-y-1.5 border-t border-pp-outline-variant/40 pt-4">
            <div className="flex justify-between font-label-sm text-label-sm text-pp-on-surface-variant">
              <span>Timeline: 60%</span>
              <span className="font-mono text-pp-on-surface">1080p • 60fps</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-pp-surface-container">
              <div className="h-full w-3/5 rounded-full bg-pp-primary" />
            </div>
          </div>
        </div>

        {/* Right: Export Matrix, Subtitle Burn-In & CAPI Integration (7 Cols) */}
        <div className="space-y-6 lg:col-span-7">
          {/* Multi-Format Export Matrix Card */}
          <div className="rounded-3xl border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-6 shadow-xs">
            <h3 className="font-headline-md text-headline-md font-bold text-pp-on-surface">
              {t('exportMatrixTitle')}
            </h3>
            <p className="mt-1 font-body-sm text-body-sm text-pp-on-surface-variant">
              {t('exportMatrixDesc')}
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Vertical Reels */}
              <div
                onClick={() => setActiveAspectRatio('9:16')}
                className={`cursor-pointer rounded-2xl border p-3.5 transition-all ${
                  activeAspectRatio === '9:16'
                    ? 'border-2 border-pp-primary bg-pp-surface-container-lowest shadow-sm'
                    : 'border-pp-outline-variant/60 bg-pp-surface-container-low hover:border-pp-primary/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-label-md font-bold text-pp-on-surface">
                    {t('formatReelsTitle')}
                  </span>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </div>
                <p className="mt-1 font-body-sm text-body-sm text-pp-on-surface-variant">
                  {t('formatReelsSpecs')}
                </p>
              </div>

              {/* Square Feed */}
              <div
                onClick={() => setActiveAspectRatio('1:1')}
                className={`cursor-pointer rounded-2xl border p-3.5 transition-all ${
                  activeAspectRatio === '1:1'
                    ? 'border-2 border-pp-primary bg-pp-surface-container-lowest shadow-sm'
                    : 'border-pp-outline-variant/60 bg-pp-surface-container-low hover:border-pp-primary/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-label-md font-bold text-pp-on-surface">
                    {t('formatSquareTitle')}
                  </span>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </div>
                <p className="mt-1 font-body-sm text-body-sm text-pp-on-surface-variant">
                  {t('formatSquareSpecs')}
                </p>
              </div>

              {/* Landscape YouTube */}
              <div
                onClick={() => setActiveAspectRatio('16:9')}
                className={`cursor-pointer rounded-2xl border p-3.5 transition-all ${
                  activeAspectRatio === '16:9'
                    ? 'border-2 border-pp-primary bg-pp-surface-container-lowest shadow-sm'
                    : 'border-pp-outline-variant/60 bg-pp-surface-container-low hover:border-pp-primary/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-label-md font-bold text-pp-on-surface">
                    {t('formatLandscapeTitle')}
                  </span>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </div>
                <p className="mt-1 font-body-sm text-body-sm text-pp-on-surface-variant">
                  {t('formatLandscapeSpecs')}
                </p>
              </div>
            </div>

            {/* Captions Options */}
            <div className="mt-6 border-t border-pp-outline-variant/40 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-label-md text-label-md font-bold text-pp-on-surface">
                    {t('captionsTitle')}
                  </h4>
                  <p className="font-body-sm text-body-sm text-pp-on-surface-variant">
                    {t('captionsDesc')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCaptionsEnabled(!captionsEnabled)}
                    className={`rounded-full px-3 py-1 font-label-sm text-label-sm font-semibold transition-all ${
                      captionsEnabled
                        ? 'bg-pp-primary text-pp-on-primary'
                        : 'bg-pp-surface-container text-pp-on-surface-variant'
                    }`}
                  >
                    {captionsEnabled ? 'Captions ON' : 'Captions OFF'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setBilingualCaptions(!bilingualCaptions)}
                    className={`rounded-full px-3 py-1 font-label-sm text-label-sm font-semibold transition-all ${
                      bilingualCaptions
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-pp-surface-container text-pp-on-surface-variant'
                    }`}
                  >
                    {t('captionsBilingual')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Ad Platform & CAPI Direct Sync Card */}
          <div className="rounded-3xl border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-6 shadow-xs">
            <h3 className="font-headline-md text-headline-md font-bold text-pp-on-surface">
              {t('capiSyncTitle')}
            </h3>
            <p className="mt-1 font-body-sm text-body-sm text-pp-on-surface-variant">
              {t('capiSyncDesc')}
            </p>

            <div className="mt-4 space-y-3">
              {/* Meta CAPI Sync */}
              <div className="flex items-center justify-between rounded-2xl border border-pp-outline-variant/40 bg-pp-surface-container-low p-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-pp-primary-fixed text-pp-primary">
                    <Share2 className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="font-label-md text-label-md font-bold text-pp-on-surface">
                      {t('syncMetaStatus')}
                    </span>
                    <span className="block font-body-sm text-body-sm text-pp-on-surface-variant">
                      Auto-sync to Meta Creative Vault
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSyncMeta}
                  className="rounded-full bg-pp-surface-container px-3.5 py-1 font-label-sm text-label-sm font-semibold text-pp-on-surface hover:bg-pp-surface-container-high hover:text-pp-primary"
                >
                  {metaSyncStatus === 'syncing' ? 'Syncing...' : metaSyncStatus === 'synced' ? 'Synced (Live)' : 'Push Now'}
                </button>
              </div>

              {/* Google Ads Asset Vault */}
              <div className="flex items-center justify-between rounded-2xl border border-pp-outline-variant/40 bg-pp-surface-container-low p-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="font-label-md text-label-md font-bold text-pp-on-surface">
                      {t('syncGoogleStatus')}
                    </span>
                    <span className="block font-body-sm text-body-sm text-pp-on-surface-variant">
                      PMax Asset Library (#412-902)
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSyncGoogle}
                  className="rounded-full bg-pp-surface-container px-3.5 py-1 font-label-sm text-label-sm font-semibold text-pp-on-surface hover:bg-pp-surface-container-high hover:text-pp-primary"
                >
                  {googleSyncStatus === 'syncing' ? 'Syncing...' : googleSyncStatus === 'synced' ? 'Synced (Live)' : 'Push Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Render Queue & Download Ledger Table */}
      <div className="rounded-3xl border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-6 shadow-xs">
        <h3 className="font-headline-md text-headline-md font-bold text-pp-on-surface">
          {t('queueTitle')}
        </h3>

        {jobs.length === 0 ? (
          <div className="py-8">
            <PpEmptyState
              icon={Video}
              title="No video renders yet"
              description="Configure your formats above and click 'Render Video' to start your first background export."
            />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-pp-outline-variant/40 font-label-sm text-label-sm font-semibold uppercase tracking-wider text-pp-outline">
                  <th className="pb-3 text-start">{t('colJobId')}</th>
                  <th className="pb-3 text-start">{t('colFormat')}</th>
                  <th className="pb-3 text-start">{t('colResolution')}</th>
                  <th className="pb-3 text-start">{t('colDuration')}</th>
                  <th className="pb-3 text-start">File Size</th>
                  <th className="pb-3 text-start">{t('colStatus')}</th>
                  <th className="pb-3 text-end">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pp-outline-variant/40 font-body-sm text-body-sm">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-pp-surface-container-low transition-colors">
                    <td className="py-3 font-mono font-bold text-pp-on-surface">
                      {job.id}
                    </td>
                    <td className="py-3 text-pp-on-surface-variant">
                      {job.format}
                    </td>
                    <td className="py-3 font-mono text-pp-on-surface-variant">
                      {job.resolution}
                    </td>
                    <td className="py-3 font-mono text-pp-on-surface">
                      {job.duration}
                    </td>
                    <td className="py-3 font-mono text-pp-on-surface-variant">
                      {job.fileSize}
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          job.status === 'synced'
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-pp-primary-fixed text-pp-on-primary-fixed-variant'
                        }`}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {job.status === 'synced' ? 'CAPI Synced' : 'Ready'}
                      </span>
                    </td>
                    <td className="py-3 text-end">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => copyJobCdn(job.id)}
                          className="inline-flex items-center gap-1 rounded-full bg-pp-surface-container px-2.5 py-1 text-[11px] font-semibold text-pp-on-surface hover:bg-pp-surface-container-high"
                          title="Copy CDN URL"
                        >
                          {copiedId === job.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          <span>{copiedId === job.id ? 'Copied' : 'Copy'}</span>
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full bg-pp-primary px-3 py-1 text-[11px] font-semibold text-pp-on-primary hover:bg-pp-primary-container"
                        >
                          <Download className="h-3 w-3" />
                          <span>Download</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
