'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
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

  const [jobs, setJobs] = useState<RenderJobItem[]>([
    {
      id: 'JOB-9041',
      format: 'Vertical Reels & TikTok',
      aspectRatio: '9:16',
      resolution: '1080x1920 (60fps)',
      duration: '00:30',
      fileSize: '42.8 MB',
      status: 'synced',
      timestamp: '12m ago',
    },
    {
      id: 'JOB-9040',
      format: 'Square Feed & Carousel',
      aspectRatio: '1:1',
      resolution: '1080x1080 (60fps)',
      duration: '00:30',
      fileSize: '36.2 MB',
      status: 'completed',
      timestamp: '45m ago',
    },
    {
      id: 'JOB-9039',
      format: 'Desktop Web & YouTube',
      aspectRatio: '16:9',
      resolution: '1920x1080 (60fps)',
      duration: '00:15',
      fileSize: '24.1 MB',
      status: 'synced',
      timestamp: '2h ago',
    },
  ]);

  const handleStartExport = () => {
    setIsExporting(true);
    setExportComplete(false);

    setTimeout(() => {
      setIsExporting(false);
      setExportComplete(true);
      const newJob: RenderJobItem = {
        id: `JOB-${Math.floor(1000 + Math.random() * 9000)}`,
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
    <div className="space-y-8">
      {/* Header Pipeline Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#ECE8F6] bg-white p-6 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)]">
        <div>
          <div className="flex items-center gap-2">
            <Video className="h-6 w-6 text-[#7064F4]" />
            <h2 className="text-xl font-bold text-[#181820]">
              {t('exportTitle')}
            </h2>
          </div>
          <p className="mt-1 text-sm text-[#6B6A78]">
            {t('exportSubtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6FAF5] px-3 py-1 text-xs font-bold text-[#0E624C]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Render Engine Active (v2.8)</span>
          </span>
          <button
            type="button"
            onClick={handleStartExport}
            disabled={isExporting}
            className="inline-flex items-center gap-2 rounded-full bg-[#7064F4] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#5243D5] disabled:opacity-50"
          >
            {isExporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            <span>{isExporting ? t('btnRendering') : t('btnRenderExport')}</span>
          </button>
        </div>
      </div>

      {exportComplete && (
        <div className="flex items-center justify-between rounded-2xl border border-[#55EFC4]/40 bg-[#E6FAF5] p-4 text-sm font-semibold text-[#0E624C] shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-[#0E624C]" />
            <span>{t('exportSuccess')}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportComplete(false)}
            className="text-xs text-[#0E624C] underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Grid: Viewport Preview Player (Left) & Export Settings / Matrix (Right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Viewport Preview Player (5 Cols) */}
        <div className="flex flex-col rounded-2xl border border-[#ECE8F6] bg-white p-6 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)] lg:col-span-5">
          <div className="flex items-center justify-between border-b border-[#ECE8F6] pb-4">
            <h3 className="text-sm font-bold text-[#181820]">
              {t('renderPreviewTitle')}
            </h3>

            {/* Aspect Ratio Toggle Pills */}
            <div className="flex items-center rounded-full bg-[#ECE8F6] p-1">
              {(['9:16', '1:1', '16:9'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setActiveAspectRatio(r)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold transition-all ${
                    activeAspectRatio === r
                      ? 'bg-[#7064F4] text-white'
                      : 'text-[#6B6A78] hover:text-[#181820]'
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
              className={`relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-[#1E1E24] to-[#2D3436] p-4 text-white shadow-xl transition-all duration-300 ${
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
          <div className="space-y-1.5 border-t border-[#ECE8F6] pt-4">
            <div className="flex justify-between text-xs font-medium text-[#6B6A78]">
              <span>Timeline: 60%</span>
              <span className="font-mono text-[#181820]">1080p • 60fps</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#ECE8F6]">
              <div className="h-full w-3/5 rounded-full bg-[#7064F4]" />
            </div>
          </div>
        </div>

        {/* Right: Export Matrix, Subtitle Burn-In & CAPI Integration (7 Cols) */}
        <div className="space-y-6 lg:col-span-7">
          {/* Multi-Format Export Matrix Card */}
          <div className="rounded-2xl border border-[#ECE8F6] bg-white p-6 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)]">
            <h3 className="text-base font-bold text-[#181820]">
              {t('exportMatrixTitle')}
            </h3>
            <p className="mt-1 text-xs text-[#6B6A78]">
              {t('exportMatrixDesc')}
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Vertical Reels */}
              <div
                onClick={() => setActiveAspectRatio('9:16')}
                className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                  activeAspectRatio === '9:16'
                    ? 'border-[#7064F4] bg-[#EBE9FD]/30 shadow-xs'
                    : 'border-[#ECE8F6] bg-white hover:border-[#7064F4]/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#181820]">
                    {t('formatReelsTitle')}
                  </span>
                  <span className="h-2 w-2 rounded-full bg-[#55EFC4]" />
                </div>
                <p className="mt-1 text-[11px] text-[#6B6A78]">
                  {t('formatReelsSpecs')}
                </p>
              </div>

              {/* Square Feed */}
              <div
                onClick={() => setActiveAspectRatio('1:1')}
                className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                  activeAspectRatio === '1:1'
                    ? 'border-[#7064F4] bg-[#EBE9FD]/30 shadow-xs'
                    : 'border-[#ECE8F6] bg-white hover:border-[#7064F4]/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#181820]">
                    {t('formatSquareTitle')}
                  </span>
                  <span className="h-2 w-2 rounded-full bg-[#55EFC4]" />
                </div>
                <p className="mt-1 text-[11px] text-[#6B6A78]">
                  {t('formatSquareSpecs')}
                </p>
              </div>

              {/* Landscape YouTube */}
              <div
                onClick={() => setActiveAspectRatio('16:9')}
                className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                  activeAspectRatio === '16:9'
                    ? 'border-[#7064F4] bg-[#EBE9FD]/30 shadow-xs'
                    : 'border-[#ECE8F6] bg-white hover:border-[#7064F4]/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#181820]">
                    {t('formatLandscapeTitle')}
                  </span>
                  <span className="h-2 w-2 rounded-full bg-[#55EFC4]" />
                </div>
                <p className="mt-1 text-[11px] text-[#6B6A78]">
                  {t('formatLandscapeSpecs')}
                </p>
              </div>
            </div>

            {/* Captions Options */}
            <div className="mt-6 border-t border-[#ECE8F6] pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#181820]">
                    {t('captionsTitle')}
                  </h4>
                  <p className="text-[11px] text-[#6B6A78]">
                    {t('captionsDesc')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCaptionsEnabled(!captionsEnabled)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                      captionsEnabled
                        ? 'bg-[#7064F4] text-white'
                        : 'bg-[#ECE8F6] text-[#6B6A78]'
                    }`}
                  >
                    {captionsEnabled ? 'Captions ON' : 'Captions OFF'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setBilingualCaptions(!bilingualCaptions)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                      bilingualCaptions
                        ? 'bg-[#E6FAF5] text-[#0E624C]'
                        : 'bg-[#ECE8F6] text-[#6B6A78]'
                    }`}
                  >
                    {t('captionsBilingual')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Ad Platform & CAPI Direct Sync Card */}
          <div className="rounded-2xl border border-[#ECE8F6] bg-white p-6 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)]">
            <h3 className="text-base font-bold text-[#181820]">
              {t('capiSyncTitle')}
            </h3>
            <p className="mt-1 text-xs text-[#6B6A78]">
              {t('capiSyncDesc')}
            </p>

            <div className="mt-4 space-y-3">
              {/* Meta CAPI Sync */}
              <div className="flex items-center justify-between rounded-xl bg-[#F5F3FB]/50 p-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EBE9FD] text-[#7064F4]">
                    <Share2 className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#181820]">
                      {t('syncMetaStatus')}
                    </span>
                    <span className="block text-[11px] text-[#6B6A78]">
                      Auto-sync to Meta Creative Vault
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSyncMeta}
                  className="rounded-full bg-[#ECE8F6] px-3.5 py-1 text-xs font-semibold text-[#181820] hover:bg-[#EBE9FD] hover:text-[#5243D5]"
                >
                  {metaSyncStatus === 'syncing' ? 'Syncing...' : metaSyncStatus === 'synced' ? 'Synced (Live)' : 'Push Now'}
                </button>
              </div>

              {/* Google Ads Asset Vault */}
              <div className="flex items-center justify-between rounded-xl bg-[#F5F3FB]/50 p-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFF6E5] text-[#684805]">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#181820]">
                      {t('syncGoogleStatus')}
                    </span>
                    <span className="block text-[11px] text-[#6B6A78]">
                      PMax Asset Library (#412-902)
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSyncGoogle}
                  className="rounded-full bg-[#ECE8F6] px-3.5 py-1 text-xs font-semibold text-[#181820] hover:bg-[#EBE9FD] hover:text-[#5243D5]"
                >
                  {googleSyncStatus === 'syncing' ? 'Syncing...' : googleSyncStatus === 'synced' ? 'Synced (Live)' : 'Push Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Render Queue & Download Ledger Table */}
      <div className="rounded-2xl border border-[#ECE8F6] bg-white p-6 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)]">
        <h3 className="text-base font-bold text-[#181820]">
          {t('queueTitle')}
        </h3>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-[#ECE8F6] text-[11px] font-semibold uppercase tracking-wider text-[#9B99A8]">
                <th className="pb-3 text-start">{t('colJobId')}</th>
                <th className="pb-3 text-start">{t('colFormat')}</th>
                <th className="pb-3 text-start">{t('colResolution')}</th>
                <th className="pb-3 text-start">{t('colDuration')}</th>
                <th className="pb-3 text-start">File Size</th>
                <th className="pb-3 text-start">{t('colStatus')}</th>
                <th className="pb-3 text-end">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECE8F6]/60 text-xs">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-[#F5F3FB]/50 transition-colors">
                  <td className="py-3 font-mono font-bold text-[#181820]">
                    {job.id}
                  </td>
                  <td className="py-3 text-[#6B6A78]">
                    {job.format}
                  </td>
                  <td className="py-3 font-mono text-[#6B6A78]">
                    {job.resolution}
                  </td>
                  <td className="py-3 font-mono text-[#181820]">
                    {job.duration}
                  </td>
                  <td className="py-3 font-mono text-[#6B6A78]">
                    {job.fileSize}
                  </td>
                  <td className="py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        job.status === 'synced'
                          ? 'bg-[#E6FAF5] text-[#0E624C]'
                          : 'bg-[#EBE9FD] text-[#5243D5]'
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
                        className="inline-flex items-center gap-1 rounded-full bg-[#ECE8F6] px-2.5 py-1 text-[11px] font-semibold text-[#181820] hover:bg-[#EBE9FD]"
                        title="Copy CDN URL"
                      >
                        {copiedId === job.id ? <Check className="h-3 w-3 text-[#0E624C]" /> : <Copy className="h-3 w-3" />}
                        <span>{copiedId === job.id ? 'Copied' : 'Copy'}</span>
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full bg-[#7064F4] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#5243D5]"
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
      </div>
    </div>
  );
}
