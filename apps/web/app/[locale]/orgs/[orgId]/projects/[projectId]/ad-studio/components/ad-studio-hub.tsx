'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  Sparkles,
  Zap,
  TrendingUp,
  Award,
  Video,
  Play,
  Share2,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Film,
  CheckCircle2,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface AdStudioHubProps {
  orgId: string;
  projectId: string;
  projectName: string;
}

interface CreativeCardItem {
  id: string;
  title: string;
  format: 'video' | 'feed' | 'carousel';
  aspectRatio: string;
  hookScore: number;
  retentionScore: number;
  predictedRoas: number;
  status: 'active' | 'review' | 'draft' | 'fatigued';
  channel: string;
  duration: string;
}

export function AdStudioHub({ orgId, projectId, projectName }: AdStudioHubProps): React.ReactElement {
  const t = useTranslations('AdStudioPage');

  // Interactive Synthesis Form State
  const [audience, setAudience] = useState('B2B SaaS Founders & Growth VPs');
  const [valueProp, setValueProp] = useState('10x faster CAC payback with automated growth telemetry');
  const [tone, setTone] = useState<'direct' | 'analytical' | 'storytelling' | 'urgent'>('direct');
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['meta', 'google', 'tiktok']);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesisSuccess, setSynthesisSuccess] = useState(false);

  // Gallery Filter State
  const [formatFilter, setFormatFilter] = useState<'all' | 'video' | 'feed' | 'carousel'>('all');

  // Autopilot Quick Guardrail State
  const [autopilotEnabled, setAutopilotEnabled] = useState(true);

  const initialCreatives: CreativeCardItem[] = [
    {
      id: 'cr-1',
      title: 'The 10x CAC Payback Blueprint',
      format: 'video',
      aspectRatio: '9:16',
      hookScore: 96,
      retentionScore: 88,
      predictedRoas: 3.8,
      status: 'active',
      channel: 'Meta Reels & TikTok',
      duration: '30s',
    },
    {
      id: 'cr-2',
      title: 'Executive Growth Telemetry Showcase',
      format: 'feed',
      aspectRatio: '1:1',
      hookScore: 92,
      retentionScore: 84,
      predictedRoas: 3.2,
      status: 'review',
      channel: 'Meta Feed & LinkedIn',
      duration: 'Static',
    },
    {
      id: 'cr-3',
      title: 'Autopilot Ad Rebalancing Demo',
      format: 'video',
      aspectRatio: '16:9',
      hookScore: 89,
      retentionScore: 79,
      predictedRoas: 2.9,
      status: 'draft',
      channel: 'YouTube Shorts & Web',
      duration: '15s',
    },
    {
      id: 'cr-4',
      title: 'Legacy Spreadsheet Chaos vs GrowthOS',
      format: 'video',
      aspectRatio: '9:16',
      hookScore: 71,
      retentionScore: 62,
      predictedRoas: 1.8,
      status: 'fatigued',
      channel: 'Meta Feed & Google RSA',
      duration: '30s',
    },
  ];

  const [creatives, setCreatives] = useState<CreativeCardItem[]>(initialCreatives);

  const handleSynthesize = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSynthesizing(true);
    setSynthesisSuccess(false);

    setTimeout(() => {
      setIsSynthesizing(false);
      setSynthesisSuccess(true);
      const newCard: CreativeCardItem = {
        id: `cr-${Date.now()}`,
        title: `${valueProp.slice(0, 36)}...`,
        format: 'video',
        aspectRatio: '9:16',
        hookScore: 95,
        retentionScore: 86,
        predictedRoas: 3.5,
        status: 'active',
        channel: 'Meta Reels',
        duration: '30s',
      };
      setCreatives((prev) => [newCard, ...prev]);
    }, 900);
  };

  const toggleChannel = (ch: string) => {
    setSelectedChannels((prev) =>
      prev.includes(ch) ? prev.filter((item) => item !== ch) : [...prev, ch],
    );
  };

  const filteredCreatives = creatives.filter((item) => {
    if (formatFilter === 'all') return true;
    return item.format === formatFilter;
  });

  return (
    <div className="space-y-8">
      {/* Executive Intro Subtitle */}
      <p className="text-sm text-[#6B6A78]">
        {t('subtitle')}
      </p>

      {/* KPI Telemetry Pods (Pastel Pulse) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Active Pipelines */}
        <div className="rounded-2xl border border-[#ECE8F6] bg-white p-5 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#9B99A8]">
              {t('activePipelines')}
            </span>
            <span className="inline-flex items-center rounded-full bg-[#E6FAF5] px-2 py-0.5 text-xs font-bold text-[#0E624C]">
              +4 Today
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-[#181820]">
              14
            </span>
            <span className="text-xs font-medium text-[#6B6A78]">Campaigns</span>
          </div>
          <p className="mt-1 text-xs text-[#6B6A78]">
            {t('activePipelinesDesc')}
          </p>
        </div>

        {/* Creative Quality Score */}
        <div className="rounded-2xl border border-[#ECE8F6] bg-white p-5 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#9B99A8]">
              {t('creativeScore')}
            </span>
            <span className="inline-flex items-center rounded-full bg-[#E6FAF5] px-2 py-0.5 text-xs font-bold text-[#0E624C]">
              Top Tier
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-[#181820]">
              94.2
            </span>
            <span className="text-xs font-medium text-[#6B6A78]">/ 100</span>
          </div>
          <p className="mt-1 text-xs text-[#6B6A78]">
            {t('creativeScoreDesc')}
          </p>
        </div>

        {/* Autopilot Pacing Efficiency */}
        <div className="rounded-2xl border border-[#ECE8F6] bg-white p-5 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#9B99A8]">
              {t('pacingEfficiency')}
            </span>
            <span className="inline-flex items-center rounded-full bg-[#EBE9FD] px-2 py-0.5 text-xs font-bold text-[#5243D5]">
              Optimal
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-[#181820]">
              98.6%
            </span>
            <span className="text-xs font-medium text-[#6B6A78]">Allocation</span>
          </div>
          <p className="mt-1 text-xs text-[#6B6A78]">
            {t('pacingEfficiencyDesc')}
          </p>
        </div>

        {/* Generation Quota */}
        <div className="rounded-2xl border border-[#ECE8F6] bg-white p-5 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#9B99A8]">
              {t('monthlyQuota')}
            </span>
            <span className="inline-flex items-center rounded-full bg-[#FFF6E5] px-2 py-0.5 text-xs font-bold text-[#684805]">
              84% Used
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-[#181820]">
              420
            </span>
            <span className="text-xs font-medium text-[#6B6A78]">/ 500 Credits</span>
          </div>
          <p className="mt-1 text-xs text-[#6B6A78]">
            {t('monthlyQuotaDesc')}
          </p>
        </div>
      </div>

      {/* Grid: Creative Synthesis Studio Form & Autopilot Quick Panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Creative Synthesis Form (2 Cols) */}
        <div className="rounded-2xl border border-[#ECE8F6] bg-white p-6 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)] lg:col-span-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#7064F4]" />
            <h2 className="text-lg font-bold text-[#181820]">
              {t('generatorTitle')}
            </h2>
          </div>
          <p className="mt-1 text-sm text-[#6B6A78]">
            {t('generatorDesc')}
          </p>

          <form onSubmit={handleSynthesize} className="mt-6 space-y-4">
            <div>
              <label htmlFor="audience-input" className="block text-xs font-semibold uppercase tracking-wider text-[#6B6A78]">
                {t('audienceLabel')}
              </label>
              <input
                id="audience-input"
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder={t('audiencePlaceholder')}
                className="mt-1.5 w-full rounded-xl border border-[#ECE8F6] bg-[#F5F3FB]/50 px-4 py-2.5 text-sm text-[#181820] placeholder-[#9B99A8] transition-all focus:border-[#7064F4] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7064F4]/20"
                required
              />
            </div>

            <div>
              <label htmlFor="value-prop-input" className="block text-xs font-semibold uppercase tracking-wider text-[#6B6A78]">
                {t('valuePropLabel')}
              </label>
              <textarea
                id="value-prop-input"
                rows={3}
                value={valueProp}
                onChange={(e) => setValueProp(e.target.value)}
                placeholder={t('valuePropPlaceholder')}
                className="mt-1.5 w-full rounded-xl border border-[#ECE8F6] bg-[#F5F3FB]/50 px-4 py-2.5 text-sm text-[#181820] placeholder-[#9B99A8] transition-all focus:border-[#7064F4] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7064F4]/20"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="tone-select" className="block text-xs font-semibold uppercase tracking-wider text-[#6B6A78]">
                  {t('toneLabel')}
                </label>
                <select
                  id="tone-select"
                  value={tone}
                  onChange={(e) => setTone(e.target.value as any)}
                  className="mt-1.5 w-full rounded-xl border border-[#ECE8F6] bg-[#F5F3FB]/50 px-4 py-2.5 text-sm text-[#181820] transition-all focus:border-[#7064F4] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7064F4]/20"
                >
                  <option value="direct">{t('toneDirect')}</option>
                  <option value="analytical">{t('toneAnalytical')}</option>
                  <option value="storytelling">{t('toneStorytelling')}</option>
                  <option value="urgent">{t('toneUrgent')}</option>
                </select>
              </div>

              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-[#6B6A78]">
                  {t('targetChannelsLabel')}
                </span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {[
                    { id: 'meta', label: 'Meta Reels' },
                    { id: 'google', label: 'Google RSA' },
                    { id: 'tiktok', label: 'TikTok Ads' },
                  ].map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => toggleChannel(ch.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                        selectedChannels.includes(ch.id)
                          ? 'bg-[#7064F4] text-white shadow-xs'
                          : 'bg-[#ECE8F6] text-[#6B6A78] hover:bg-[#EBE9FD]'
                      }`}
                    >
                      {ch.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {synthesisSuccess && (
              <div className="flex items-center gap-2 rounded-xl bg-[#E6FAF5] p-3 text-sm font-medium text-[#0E624C]">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{t('synthesizedSuccess')}</span>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSynthesizing}
                className="inline-flex items-center gap-2 rounded-full bg-[#7064F4] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#5243D5] disabled:opacity-50"
              >
                <Zap className="h-4 w-4" />
                <span>
                  {isSynthesizing ? t('btnSynthesizing') : t('btnSynthesize')}
                </span>
              </button>
            </div>
          </form>
        </div>

        {/* Autopilot Status Card (1 Col) */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#ECE8F6] bg-white p-6 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)]">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#7064F4]" />
                <h2 className="text-base font-bold text-[#181820]">
                  {t('autopilotStatusTitle')}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setAutopilotEnabled((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  autopilotEnabled ? 'bg-[#7064F4]' : 'bg-[#ECE8F6]'
                }`}
                role="switch"
                aria-checked={autopilotEnabled}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    autopilotEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  autopilotEnabled
                    ? 'bg-[#E6FAF5] text-[#0E624C]'
                    : 'bg-[#FFF6E5] text-[#684805]'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${autopilotEnabled ? 'bg-[#55EFC4]' : 'bg-[#FDCB6E]'}`} />
                {autopilotEnabled ? t('autopilotActive') : t('autopilotPaused')}
              </span>
            </div>

            <div className="mt-6 space-y-4 text-sm">
              <div className="flex items-center justify-between border-b border-[#ECE8F6] pb-3">
                <span className="text-[#6B6A78]">{t('dailyCap')}</span>
                <span className="font-bold text-[#181820]">$4,500 / day</span>
              </div>
              <div className="flex items-center justify-between border-b border-[#ECE8F6] pb-3">
                <span className="text-[#6B6A78]">{t('fatigueProtection')}</span>
                <span className="inline-flex items-center rounded-full bg-[#EBE9FD] px-2 py-0.5 text-xs font-semibold text-[#5243D5]">
                  Automated
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#6B6A78]">Min ROAS Guardrail</span>
                <span className="font-bold text-[#181820]">2.5x Floor</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[#ECE8F6]">
            <Link
              href={`/orgs/${orgId}/projects/${projectId}/ad-studio/autopilot`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#ECE8F6] px-4 py-2.5 text-sm font-semibold text-[#181820] transition-colors hover:bg-[#EBE9FD] hover:text-[#5243D5]"
            >
              <span>{t('btnViewAutopilot')}</span>
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </div>
        </div>
      </div>

      {/* Creative Scoring & Performance Radar Gallery */}
      <div className="rounded-2xl border border-[#ECE8F6] bg-white p-6 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#181820]">
              {t('galleryTitle')}
            </h2>
            <p className="mt-1 text-sm text-[#6B6A78]">
              {t('galleryDesc')}
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2">
            {[
              { id: 'all', label: t('filterAll') },
              { id: 'video', label: t('filterVideo') },
              { id: 'feed', label: t('filterFeed') },
              { id: 'carousel', label: t('filterCarousel') },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormatFilter(f.id as any)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  formatFilter === f.id
                    ? 'bg-[#7064F4] text-white shadow-xs'
                    : 'bg-[#ECE8F6] text-[#6B6A78] hover:bg-[#EBE9FD]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Gallery Grid */}
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {filteredCreatives.map((creative) => {
            const isFatigued = creative.status === 'fatigued';
            return (
              <div
                key={creative.id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[#ECE8F6] bg-white p-4 shadow-sm transition-all hover:border-[#7064F4]/40 hover:shadow-md"
              >
                <div>
                  {/* Format & Status Header */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md bg-[#ECE8F6] px-2 py-0.5 text-[11px] font-bold text-[#6B6A78]">
                      {creative.aspectRatio} • {creative.duration}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        isFatigued
                          ? 'bg-[#FFF1F1] text-[#D63031]'
                          : creative.status === 'active'
                          ? 'bg-[#E6FAF5] text-[#0E624C]'
                          : 'bg-[#EBE9FD] text-[#5243D5]'
                      }`}
                    >
                      {isFatigued && <AlertTriangle className="h-3 w-3" />}
                      {isFatigued
                        ? t('cardStatusFatigued')
                        : creative.status === 'active'
                        ? t('cardStatusActive')
                        : creative.status === 'review'
                        ? t('cardStatusReview')
                        : t('cardStatusDraft')}
                    </span>
                  </div>

                  {/* Thumbnail / Aspect Ratio Mockup Surface */}
                  <div className="mt-3 flex h-36 w-full items-center justify-center rounded-xl bg-gradient-to-br from-[#ECE8F6] to-[#EBE9FD] text-[#7064F4] transition-all group-hover:scale-[1.02]">
                    <div className="flex flex-col items-center gap-1.5 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
                        <Play className="h-4 w-4 ms-0.5 text-[#7064F4]" />
                      </div>
                      <span className="text-[11px] font-semibold text-[#5243D5]">
                        {creative.channel}
                      </span>
                    </div>
                  </div>

                  {/* Creative Title */}
                  <h3 className="mt-3 text-sm font-bold text-[#181820] line-clamp-2">
                    {creative.title}
                  </h3>

                  {/* Algorithmic Scoring Pods */}
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#ECE8F6] pt-3 text-center">
                    <div>
                      <span className="text-[10px] font-semibold uppercase text-[#9B99A8]">
                        {t('cardHookScore')}
                      </span>
                      <p className="text-sm font-extrabold text-[#181820]">
                        {creative.hookScore}%
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold uppercase text-[#9B99A8]">
                        {t('cardRetentionScore')}
                      </span>
                      <p className="text-sm font-extrabold text-[#181820]">
                        {creative.retentionScore}%
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold uppercase text-[#9B99A8]">
                        {t('cardRoasScore')}
                      </span>
                      <p className={`text-sm font-extrabold ${isFatigued ? 'text-[#D63031]' : 'text-[#0E624C]'}`}>
                        {creative.predictedRoas}x
                      </p>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="mt-4 flex items-center gap-2 border-t border-[#ECE8F6] pt-3">
                  <Link
                    href={`/orgs/${orgId}/projects/${projectId}/ad-studio/storyboard`}
                    className="flex flex-1 items-center justify-center gap-1 rounded-full bg-[#ECE8F6] py-1.5 text-xs font-semibold text-[#181820] transition-colors hover:bg-[#EBE9FD] hover:text-[#5243D5]"
                  >
                    <Film className="h-3 w-3" />
                    <span>{t('btnOpenStoryboard')}</span>
                  </Link>
                  <Link
                    href={`/orgs/${orgId}/projects/${projectId}/ad-studio/video-export`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-[#7064F4] text-white transition-colors hover:bg-[#5243D5]"
                    title={t('btnExportVideo')}
                  >
                    <Video className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
