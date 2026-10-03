'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { PpCard, PpButton, ppInputClass, PpPill } from '@/components/pastel/primitives';
import {
  Film,
  Sparkles,
  Play,
  Save,
  CheckCircle2,
  Video,
  Music,
  Mic,
  Sliders,
  Layers,
  Clock,
  ArrowRight,
  Eye,
  Timer,
  Zap,
} from 'lucide-react';

interface StoryboardEditorProps {
  orgId: string;
  projectId: string;
  projectName: string;
}

interface SceneItem {
  id: number;
  titleKey: string;
  descKey: string;
  durationSec: number;
  visualPrompt: string;
  voiceoverScript: string;
}

export function StoryboardEditor({ orgId, projectId, projectName }: StoryboardEditorProps): React.ReactElement {
  const t = useTranslations('AdStudioPage');

  const [aspectRatio, setAspectRatio] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [totalDuration, setTotalDuration] = useState<'15s' | '30s' | '60s'>('30s');
  const [selectedAudioTrack, setSelectedAudioTrack] = useState('energetic');
  const [selectedVoiceActor, setSelectedVoiceActor] = useState('rachel');
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [isSaved, setIsSaved] = useState(false);

  const [scenes, setScenes] = useState<SceneItem[]>([
    {
      id: 1,
      titleKey: 'scene1Title',
      descKey: 'scene1Desc',
      durationSec: 3,
      visualPrompt: 'Dynamic 3D cinematic zoom on a frustrated marketer staring at red charts on three screens, sudden flash of periwinkle light.',
      voiceoverScript: 'Still burning ad budget trying to guess which campaign actually drove paying customers?',
    },
    {
      id: 2,
      titleKey: 'scene2Title',
      descKey: 'scene2Desc',
      durationSec: 7,
      visualPrompt: 'Chaotic floating Excel spreadsheets with conflicting CAC numbers colliding and shattering into dust.',
      voiceoverScript: 'Disconnected ad platforms and blind attribution are draining 40% of your growth capital every single month.',
    },
    {
      id: 3,
      titleKey: 'scene3Title',
      descKey: 'scene3Desc',
      durationSec: 8,
      visualPrompt: 'Smooth transition into sleek GrowthOS Pastel Pulse executive dashboard glowing with real-time conversion stream.',
      voiceoverScript: 'Meet GrowthOS. The autonomous marketing telemetry engine connecting raw clickstream events directly to true ROAS.',
    },
    {
      id: 4,
      titleKey: 'scene4Title',
      descKey: 'scene4Desc',
      durationSec: 6,
      visualPrompt: 'Animated 3.4x ROAS metric counter ticking up in mint green, customer logo badges illuminating in sequence.',
      voiceoverScript: 'Over 1,800 modern SaaS teams cut their payback window down to four months with autonomous pacing.',
    },
    {
      id: 5,
      titleKey: 'scene5Title',
      descKey: 'scene5Desc',
      durationSec: 6,
      visualPrompt: 'Polished white call-to-action button pulsing with periwinkle glow: Start Free Workspace, official brand lockup.',
      voiceoverScript: 'Launch your high-velocity workspace today at GrowthOS. Live telemetry in under five minutes.',
    },
  ]);

  const updateScenePrompt = (index: number, newPrompt: string) => {
    setScenes((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], visualPrompt: newPrompt };
      return copy;
    });
    setIsSaved(false);
  };

  const updateSceneVoiceover = (index: number, newVoiceover: string) => {
    setScenes((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], voiceoverScript: newVoiceover };
      return copy;
    });
    setIsSaved(false);
  };

  const handleSave = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const activeScene = scenes[activeSceneIndex];

  return (
    <div className="space-y-6">
      {/* Header & Format Settings Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-6 shadow-xs">
        <div>
          <h2 className="font-headline-md text-headline-md font-bold text-pp-on-surface">
            {t('storyboardTitle')}
          </h2>
          <p className="mt-1 font-body-sm text-body-sm text-pp-on-surface-variant">
            {t('storyboardSubtitle')}
          </p>
        </div>

        {/* Global Controls: Aspect Ratio & Duration */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Aspect Ratio Switcher */}
          <div className="flex items-center rounded-full bg-pp-surface-container p-1">
            {[
              { id: '9:16', label: '9:16' },
              { id: '1:1', label: '1:1' },
              { id: '16:9', label: '16:9' },
            ].map((ratio) => (
              <button
                key={ratio.id}
                type="button"
                onClick={() => setAspectRatio(ratio.id as any)}
                className={`rounded-full px-3 py-1 font-label-sm text-label-sm font-bold transition-all ${
                  aspectRatio === ratio.id
                    ? 'bg-pp-primary text-pp-on-primary shadow-xs'
                    : 'text-pp-on-surface-variant hover:text-pp-on-surface'
                }`}
              >
                {ratio.label}
              </button>
            ))}
          </div>

          {/* Duration Selector */}
          <div className="flex items-center rounded-full bg-pp-surface-container p-1">
            {[
              { id: '15s', label: '15s' },
              { id: '30s', label: '30s' },
              { id: '60s', label: '60s' },
            ].map((dur) => (
              <button
                key={dur.id}
                type="button"
                onClick={() => setTotalDuration(dur.id as any)}
                className={`rounded-full px-3 py-1 font-label-sm text-label-sm font-bold transition-all ${
                  totalDuration === dur.id
                    ? 'bg-pp-inverse-surface text-pp-inverse-on-surface shadow-xs'
                    : 'text-pp-on-surface-variant hover:text-pp-on-surface'
                }`}
              >
                {dur.label}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded-full bg-pp-surface-container px-4 py-2 font-label-sm text-label-sm font-bold text-pp-on-surface transition-colors hover:bg-pp-surface-container-high"
          >
            {isSaved ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Save className="h-4 w-4 text-pp-primary" />}
            <span>{isSaved ? 'Saved!' : t('btnSaveStoryboard')}</span>
          </button>

          <Link
            href={`/orgs/${orgId}/projects/${projectId}/ad-studio/video-export`}
            className="inline-flex items-center gap-1.5 rounded-full bg-pp-primary px-5 py-2 font-label-sm text-label-sm font-bold text-pp-on-primary shadow-xs transition-all hover:bg-pp-primary-container"
          >
            <span>{t('btnProceedToExport')}</span>
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </div>
      </div>

      {/* Timeline Sub-Bar (Stitch sub-header) */}
      <div className="rounded-2xl border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-4 shadow-xs">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-pp-surface-container px-3 py-1 font-label-sm text-label-sm font-bold text-pp-on-surface">
              <Timer className="h-3.5 w-3.5 text-pp-primary" />
              <span>00:{scenes[activeSceneIndex].durationSec.toString().padStart(2, '0')} / {totalDuration} Duration</span>
            </div>
            <span className="rounded-full bg-pp-primary-fixed px-2.5 py-1 font-label-sm text-label-sm font-bold text-pp-on-primary-fixed-variant">
              5 Beats
            </span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-label-sm text-label-sm font-bold text-emerald-800">
              145 WPM (Optimal UGC Pace)
            </span>
          </div>

          {/* Timeline Bar */}
          <div className="flex flex-1 max-w-md items-center gap-1 rounded-full bg-pp-surface-container p-1">
            {scenes.map((s, idx) => {
              const bgColors = ['bg-pp-primary', 'bg-amber-200', 'bg-pp-primary-fixed-dim', 'bg-emerald-300', 'bg-pink-200'];
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSceneIndex(idx)}
                  className={`h-2.5 flex-1 rounded-full transition-all ${bgColors[idx % bgColors.length]} ${
                    activeSceneIndex === idx ? 'ring-2 ring-pp-primary' : 'opacity-80 hover:opacity-100'
                  }`}
                  title={`${s.id} - ${t(s.titleKey as any)} (${s.durationSec}s)`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Studio Grid: Scene Timeline & Active Scene Detail Editor */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Scene Breakdown Stepper / Timeline (5 Cols) */}
        <div className="space-y-3 lg:col-span-5">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-pp-outline">
              {t('sceneBreakdownTitle')}
            </h3>
            <span className="font-label-sm text-label-sm font-semibold text-pp-on-surface-variant">
              5 Scenes • {totalDuration} Total
            </span>
          </div>

          <div className="space-y-2">
            {scenes.map((scene, idx) => {
              const isActive = activeSceneIndex === idx;
              return (
                <div
                  key={scene.id}
                  onClick={() => setActiveSceneIndex(idx)}
                  className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                    isActive
                      ? 'border-2 border-pp-primary bg-pp-surface-container-lowest shadow-sm'
                      : 'border-pp-outline-variant/60 bg-pp-surface-container-low hover:border-pp-primary/40 hover:bg-pp-surface-container-lowest'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          isActive
                            ? 'bg-pp-primary text-pp-on-primary'
                            : 'bg-pp-surface-container text-pp-on-surface-variant'
                        }`}
                      >
                        {scene.id}
                      </span>
                      <span className="font-label-md text-label-md font-bold text-pp-on-surface">
                        {t(scene.titleKey as any)}
                      </span>
                    </div>
                    <span className="rounded-md bg-pp-surface-container px-2 py-0.5 font-label-sm text-label-sm font-semibold text-pp-on-surface-variant">
                      {scene.durationSec}s
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 font-body-sm text-body-sm text-pp-on-surface-variant">
                    {scene.voiceoverScript}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Scene Detail & Prompt Studio (7 Cols) */}
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-3xl border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-6 shadow-xs">
            <div className="flex items-center justify-between border-b border-pp-outline-variant/40 pb-4">
              <div>
                <span className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-pp-primary">
                  Editing Scene {activeScene.id} of 5
                </span>
                <h3 className="font-headline-md text-headline-md font-bold text-pp-on-surface">
                  {t(activeScene.titleKey as any)}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 rounded-full bg-pp-primary-fixed/50 px-3 py-1 font-label-sm text-label-sm font-semibold text-pp-on-primary-fixed-variant">
                  <Clock className="h-3 w-3" />
                  {activeScene.durationSec} seconds
                </span>
              </div>
            </div>

            {/* Scene Preview Mockup Box */}
            <div className="mt-4 flex aspect-video w-full flex-col items-center justify-center rounded-2xl border border-pp-outline-variant/40 bg-gradient-to-br from-pp-surface-container-low to-pp-primary-fixed/20 p-6 text-center">
              <Film className="h-8 w-8 text-pp-primary" />
              <p className="mt-2 max-w-md font-body-md text-body-md font-medium text-pp-on-surface">
                &ldquo;{activeScene.voiceoverScript}&rdquo;
              </p>
              <span className="mt-1 font-label-sm text-label-sm text-pp-outline">
                Aspect Ratio: {aspectRatio} • Format Target: Meta / TikTok
              </span>
            </div>

            {/* Voiceover Script Input */}
            <div className="mt-6">
              <label
                htmlFor="voiceover-input"
                className="flex items-center gap-1.5 font-label-sm text-label-sm font-semibold uppercase tracking-wider text-pp-on-surface-variant"
              >
                <Mic className="h-3.5 w-3.5 text-pp-primary" />
                <span>{t('voiceoverLabel')}</span>
              </label>
              <textarea
                id="voiceover-input"
                rows={3}
                value={activeScene.voiceoverScript}
                onChange={(e) => updateSceneVoiceover(activeSceneIndex, e.target.value)}
                className={`mt-1.5 w-full rounded-2xl resize-none ${ppInputClass}`}
              />
            </div>

            {/* Visual Generation Prompt Input */}
            <div className="mt-4">
              <label
                htmlFor="visual-prompt-input"
                className="flex items-center gap-1.5 font-label-sm text-label-sm font-semibold uppercase tracking-wider text-pp-on-surface-variant"
              >
                <Sparkles className="h-3.5 w-3.5 text-pp-primary" />
                <span>{t('visualPromptLabel')}</span>
              </label>
              <textarea
                id="visual-prompt-input"
                rows={3}
                value={activeScene.visualPrompt}
                onChange={(e) => updateScenePrompt(activeSceneIndex, e.target.value)}
                className={`mt-1.5 w-full rounded-2xl resize-none ${ppInputClass}`}
              />
            </div>
          </div>

          {/* Asset Selector & Media Library Panel */}
          <div className="rounded-3xl border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-6 shadow-xs">
            <h4 className="font-headline-md text-headline-md font-bold text-pp-on-surface">
              {t('mediaAssetsTitle')}
            </h4>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="audio-track-select" className="flex items-center gap-1.5 font-label-sm text-label-sm font-semibold uppercase tracking-wider text-pp-on-surface-variant">
                  <Music className="h-3.5 w-3.5 text-pp-primary" />
                  <span>{t('audioTrackLabel')}</span>
                </label>
                <select
                  id="audio-track-select"
                  value={selectedAudioTrack}
                  onChange={(e) => setSelectedAudioTrack(e.target.value)}
                  className={`mt-1.5 w-full rounded-2xl ${ppInputClass}`}
                >
                  <option value="energetic">{t('trackEnergetic')}</option>
                  <option value="ambient">{t('trackAmbient')}</option>
                  <option value="synthwave">{t('trackSynthwave')}</option>
                </select>
              </div>

              <div>
                <label htmlFor="voice-actor-select" className="flex items-center gap-1.5 font-label-sm text-label-sm font-semibold uppercase tracking-wider text-pp-on-surface-variant">
                  <Mic className="h-3.5 w-3.5 text-pp-primary" />
                  <span>{t('voiceActorLabel')}</span>
                </label>
                <select
                  id="voice-actor-select"
                  value={selectedVoiceActor}
                  onChange={(e) => setSelectedVoiceActor(e.target.value)}
                  className={`mt-1.5 w-full rounded-2xl ${ppInputClass}`}
                >
                  <option value="rachel">{t('voiceActorFemale')}</option>
                  <option value="marcus">{t('voiceActorMale')}</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
