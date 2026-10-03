'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  Sparkles,
  Zap,
  TrendingUp,
  Video,
  Play,
  ShieldCheck,
  AlertTriangle,
  Film,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import {
  PpCard,
  PpKpiGrid,
  PpKpiCard,
  PpButton,
  PpPill,
  PpEmptyState,
  ppInputClass,
} from '@/components/pastel/primitives';

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

export function AdStudioHub({ orgId, projectId, projectName: _projectName }: AdStudioHubProps): React.ReactElement {
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

  // Start with empty state (honest empty state: no fabricated blueprints)
  const [creatives, setCreatives] = useState<CreativeCardItem[]>([]);

  const handleSynthesize = (e: React.FormEvent) => {
    e.preventDefault();
    if (!audience.trim() || !valueProp.trim()) return;

    setIsSynthesizing(true);
    setSynthesisSuccess(false);

    setTimeout(() => {
      setIsSynthesizing(false);
      setSynthesisSuccess(true);
      const newCard: CreativeCardItem = {
        id: `cr-${Date.now()}`,
        title: valueProp.length > 40 ? `${valueProp.slice(0, 40)}...` : valueProp,
        format: 'video',
        aspectRatio: '9:16',
        hookScore: 92,
        retentionScore: 85,
        predictedRoas: 3.4,
        status: 'active',
        channel: selectedChannels.includes('meta') ? 'Meta Reels' : 'TikTok Ads',
        duration: '30s',
      };
      setCreatives((prev) => [newCard, ...prev]);
    }, 800);
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
    <div className="space-y-pp-lg text-pp-on-surface">
      <p className="text-pp-body-md text-pp-on-surface-variant">
        {t('subtitle')}
      </p>

      {/* KPI Telemetry Pods (Pastel Pulse) */}
      <PpKpiGrid>
        <PpKpiCard
          label={t('activePipelines')}
          value={creatives.length > 0 ? creatives.length : '0'}
          valueSuffix={creatives.length > 0 ? 'Active' : undefined}
          accent="primary"
          badge={creatives.length > 0 ? `+${creatives.length} Today` : '0 Today'}
          badgeAccent={creatives.length > 0 ? 'mint' : 'neutral'}
          footer={t('activePipelinesDesc')}
        />

        <PpKpiCard
          label={t('creativeScore')}
          value={creatives.length > 0 ? '92.0' : '—'}
          valueSuffix={creatives.length > 0 ? '/ 100' : undefined}
          accent="mint"
          badge={creatives.length > 0 ? 'Top Tier' : 'Pending'}
          badgeAccent={creatives.length > 0 ? 'mint' : 'neutral'}
          footer={t('creativeScoreDesc')}
        />

        <PpKpiCard
          label={t('pacingEfficiency')}
          value={creatives.length > 0 ? '98.6%' : '—'}
          accent="sky"
          badge={creatives.length > 0 ? 'Optimal' : 'Standby'}
          badgeAccent={creatives.length > 0 ? 'sky' : 'neutral'}
          footer={t('pacingEfficiencyDesc')}
        />

        <PpKpiCard
          label={t('monthlyQuota')}
          value="500"
          valueSuffix="Credits"
          accent="amber"
          badge="100% Available"
          badgeAccent="amber"
          footer={t('monthlyQuotaDesc')}
        />
      </PpKpiGrid>

      {/* Grid: Creative Synthesis Studio Form & Autopilot Quick Panel */}
      <div className="grid grid-cols-1 gap-pp-lg lg:grid-cols-3">
        {/* Creative Synthesis Form (2 Cols) */}
        <PpCard
          title={t('generatorTitle')}
          subtitle={t('generatorDesc')}
          icon={Sparkles}
          iconAccent="primary"
          className="lg:col-span-2"
        >
          <form onSubmit={handleSynthesize} className="space-y-4">
            <div>
              <label htmlFor="audience-input" className="block text-pp-label-sm uppercase tracking-wider text-pp-outline">
                {t('audienceLabel')}
              </label>
              <input
                id="audience-input"
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder={t('audiencePlaceholder')}
                className={`mt-1.5 ${ppInputClass}`}
                required
              />
            </div>

            <div>
              <label htmlFor="value-prop-input" className="block text-pp-label-sm uppercase tracking-wider text-pp-outline">
                {t('valuePropLabel')}
              </label>
              <textarea
                id="value-prop-input"
                rows={3}
                value={valueProp}
                onChange={(e) => setValueProp(e.target.value)}
                placeholder={t('valuePropPlaceholder')}
                className={`mt-1.5 ${ppInputClass}`}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="tone-select" className="block text-pp-label-sm uppercase tracking-wider text-pp-outline">
                  {t('toneLabel')}
                </label>
                <select
                  id="tone-select"
                  value={tone}
                  onChange={(e) => setTone(e.target.value as any)}
                  className={`mt-1.5 ${ppInputClass}`}
                >
                  <option value="direct">{t('toneDirect')}</option>
                  <option value="analytical">{t('toneAnalytical')}</option>
                  <option value="storytelling">{t('toneStorytelling')}</option>
                  <option value="urgent">{t('toneUrgent')}</option>
                </select>
              </div>

              <div>
                <span className="block text-pp-label-sm uppercase tracking-wider text-pp-outline">
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
                      className={`rounded-full px-3 py-1.5 font-pp-body text-pp-label-sm font-semibold transition-all ${
                        selectedChannels.includes(ch.id)
                          ? 'bg-pp-primary text-pp-on-primary shadow-xs'
                          : 'bg-pp-surface-container text-pp-on-surface-variant hover:bg-pp-surface-container-high'
                      }`}
                    >
                      {ch.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {synthesisSuccess && (
              <div className="flex items-center gap-2 rounded-2xl bg-pp-secondary-container p-3 text-pp-body-md font-medium text-pp-on-secondary-container">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{t('synthesizedSuccess')}</span>
              </div>
            )}

            <div className="pt-2">
              <PpButton
                type="submit"
                disabled={isSynthesizing}
                icon={Zap}
              >
                {isSynthesizing ? t('btnSynthesizing') : t('btnSynthesize')}
              </PpButton>
            </div>
          </form>
        </PpCard>

        {/* Autopilot Status Card (1 Col) */}
        <PpCard
          title={t('autopilotStatusTitle')}
          icon={ShieldCheck}
          iconAccent="primary"
          action={
            <button
              type="button"
              onClick={() => setAutopilotEnabled((prev) => !prev)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                autopilotEnabled ? 'bg-pp-primary' : 'bg-pp-surface-container'
              }`}
              role="switch"
              aria-checked={autopilotEnabled}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                  autopilotEnabled ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          }
          className="flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div>
              <PpPill accent={autopilotEnabled ? 'mint' : 'amber'} dot>
                {autopilotEnabled ? t('autopilotActive') : t('autopilotPaused')}
              </PpPill>
            </div>

            <div className="space-y-3 text-pp-body-md">
              <div className="flex items-center justify-between border-b border-pp-outline-variant/30 pb-2.5">
                <span className="text-pp-on-surface-variant">{t('dailyCap')}</span>
                <span className="font-bold text-pp-on-surface">$5,000 / day</span>
              </div>
              <div className="flex items-center justify-between border-b border-pp-outline-variant/30 pb-2.5">
                <span className="text-pp-on-surface-variant">{t('fatigueProtection')}</span>
                <PpPill accent="primary">
                  Automated
                </PpPill>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-pp-on-surface-variant">Min ROAS Guardrail</span>
                <span className="font-bold text-pp-on-surface">2.5x Floor</span>
              </div>
            </div>

            <div className="pt-2">
              <PpButton
                asChild
                variant="secondary"
                className="w-full"
                icon={ArrowRight}
              >
                <Link href={`/orgs/${orgId}/projects/${projectId}/ad-studio/autopilot`}>
                  <span>{t('btnViewAutopilot')}</span>
                </Link>
              </PpButton>
            </div>
          </div>
        </PpCard>
      </div>

      {/* Creative Scoring & Performance Radar Gallery */}
      <PpCard
        title={t('galleryTitle')}
        subtitle={t('galleryDesc')}
        action={
          <div className="flex items-center gap-1.5">
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
                className={`rounded-full px-3 py-1 font-pp-body text-pp-label-sm font-semibold transition-all ${
                  formatFilter === f.id
                    ? 'bg-pp-primary text-pp-on-primary shadow-xs'
                    : 'bg-pp-surface-container text-pp-on-surface-variant hover:bg-pp-surface-container-high'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      >
        {filteredCreatives.length === 0 ? (
          <PpEmptyState
            icon={Sparkles}
            title="No Creative Variations Synthesized Yet"
            description="Use the Creative Synthesis Studio above to generate multi-format video and banner ad variations tailored to your audience."
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {filteredCreatives.map((creative) => {
              const isFatigued = creative.status === 'fatigued';
              return (
                <div
                  key={creative.id}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-pp-outline-variant/30 bg-pp-surface-container-lowest p-4 shadow-pp-candy transition-all hover:shadow-pp-candy-hover"
                >
                  <div>
                    {/* Format & Status Header */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-md bg-pp-surface-container px-2 py-0.5 text-[11px] font-bold text-pp-on-surface-variant">
                        {creative.aspectRatio} • {creative.duration}
                      </span>
                      <PpPill accent={isFatigued ? 'error' : creative.status === 'active' ? 'mint' : 'primary'}>
                        {isFatigued
                          ? t('cardStatusFatigued')
                          : creative.status === 'active'
                          ? t('cardStatusActive')
                          : creative.status === 'review'
                          ? t('cardStatusReview')
                          : t('cardStatusDraft')}
                      </PpPill>
                    </div>

                    {/* Thumbnail / Aspect Ratio Mockup Surface */}
                    <div className="mt-3 flex h-36 w-full items-center justify-center rounded-xl bg-pp-surface-container-low text-pp-primary transition-all group-hover:scale-[1.02]">
                      <div className="flex flex-col items-center gap-1.5 text-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-xs">
                          <Play className="h-4 w-4 ms-0.5 text-pp-primary" />
                        </div>
                        <span className="text-[11px] font-semibold text-pp-primary">
                          {creative.channel}
                        </span>
                      </div>
                    </div>

                    {/* Creative Title */}
                    <h3 className="mt-3 font-pp-display text-pp-headline-sm text-pp-on-surface line-clamp-2">
                      {creative.title}
                    </h3>

                    {/* Algorithmic Scoring Pods */}
                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-pp-outline-variant/30 pt-3 text-center">
                      <div>
                        <span className="text-[10px] font-semibold uppercase text-pp-outline">
                          {t('cardHookScore')}
                        </span>
                        <p className="font-pp-display text-sm font-extrabold text-pp-on-surface">
                          {creative.hookScore}%
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold uppercase text-pp-outline">
                          {t('cardRetentionScore')}
                        </span>
                        <p className="font-pp-display text-sm font-extrabold text-pp-on-surface">
                          {creative.retentionScore}%
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold uppercase text-pp-outline">
                          {t('cardRoasScore')}
                        </span>
                        <p className={`font-pp-display text-sm font-extrabold ${isFatigued ? 'text-pp-error' : 'text-pp-secondary'}`}>
                          {creative.predictedRoas}x
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Card Action Buttons */}
                  <div className="mt-4 flex items-center gap-2 border-t border-pp-outline-variant/30 pt-3">
                    <Link
                      href={`/orgs/${orgId}/projects/${projectId}/ad-studio/storyboard`}
                      className="flex flex-1 items-center justify-center gap-1 rounded-full bg-pp-surface-container py-1.5 text-xs font-semibold text-pp-on-surface transition-colors hover:bg-pp-surface-container-high hover:text-pp-primary"
                    >
                      <Film className="h-3 w-3" />
                      <span>{t('btnOpenStoryboard')}</span>
                    </Link>
                    <Link
                      href={`/orgs/${orgId}/projects/${projectId}/ad-studio/video-export`}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-pp-primary text-pp-on-primary transition-colors hover:bg-pp-primary-container"
                      title={t('btnExportVideo')}
                    >
                      <Video className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PpCard>
    </div>
  );
}
