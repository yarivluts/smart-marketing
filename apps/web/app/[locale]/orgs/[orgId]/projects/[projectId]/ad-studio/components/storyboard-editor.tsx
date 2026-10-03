'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
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
    <div className="space-y-8">
      {/* Header & Format Settings Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#ECE8F6] bg-white p-6 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)]">
        <div>
          <h2 className="text-xl font-bold text-[#181820]">
            {t('storyboardTitle')}
          </h2>
          <p className="mt-1 text-sm text-[#6B6A78]">
            {t('storyboardSubtitle')}
          </p>
        </div>

        {/* Global Controls: Aspect Ratio & Duration */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Aspect Ratio Switcher */}
          <div className="flex items-center rounded-full bg-[#ECE8F6] p-1">
            {[
              { id: '9:16', label: '9:16' },
              { id: '1:1', label: '1:1' },
              { id: '16:9', label: '16:9' },
            ].map((ratio) => (
              <button
                key={ratio.id}
                type="button"
                onClick={() => setAspectRatio(ratio.id as any)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                  aspectRatio === ratio.id
                    ? 'bg-[#7064F4] text-white shadow-xs'
                    : 'text-[#6B6A78] hover:text-[#181820]'
                }`}
              >
                {ratio.label}
              </button>
            ))}
          </div>

          {/* Duration Selector */}
          <div className="flex items-center rounded-full bg-[#ECE8F6] p-1">
            {[
              { id: '15s', label: '15s' },
              { id: '30s', label: '30s' },
              { id: '60s', label: '60s' },
            ].map((dur) => (
              <button
                key={dur.id}
                type="button"
                onClick={() => setTotalDuration(dur.id as any)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                  totalDuration === dur.id
                    ? 'bg-[#1E1E24] text-white shadow-xs'
                    : 'text-[#6B6A78] hover:text-[#181820]'
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
            className="inline-flex items-center gap-1.5 rounded-full bg-[#ECE8F6] px-4 py-2 text-xs font-bold text-[#181820] transition-colors hover:bg-[#EBE9FD] hover:text-[#5243D5]"
          >
            {isSaved ? <CheckCircle2 className="h-4 w-4 text-[#0E624C]" /> : <Save className="h-4 w-4" />}
            <span>{isSaved ? 'Saved!' : t('btnSaveStoryboard')}</span>
          </button>

          <Link
            href={`/orgs/${orgId}/projects/${projectId}/ad-studio/video-export`}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#7064F4] px-5 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#5243D5]"
          >
            <span>{t('btnProceedToExport')}</span>
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </div>
      </div>

      {/* Main Studio Grid: Scene Timeline & Active Scene Detail Editor */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Scene Breakdown Stepper / Timeline (5 Cols) */}
        <div className="space-y-3 lg:col-span-5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#9B99A8]">
              {t('sceneBreakdownTitle')}
            </h3>
            <span className="text-xs font-semibold text-[#6B6A78]">
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
                      ? 'border-[#7064F4] bg-white shadow-[0_8px_24px_-4px_rgba(112,100,244,0.12)]'
                      : 'border-[#ECE8F6] bg-white/70 hover:border-[#7064F4]/30 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          isActive
                            ? 'bg-[#7064F4] text-white'
                            : 'bg-[#ECE8F6] text-[#6B6A78]'
                        }`}
                      >
                        {scene.id}
                      </span>
                      <span className="text-sm font-bold text-[#181820]">
                        {t(scene.titleKey as any)}
                      </span>
                    </div>
                    <span className="rounded-md bg-[#ECE8F6] px-2 py-0.5 text-xs font-bold text-[#6B6A78]">
                      {scene.durationSec}s
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[#6B6A78] line-clamp-2">
                    {scene.voiceoverScript}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Scene Detail & Prompt Studio (7 Cols) */}
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-2xl border border-[#ECE8F6] bg-white p-6 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)]">
            <div className="flex items-center justify-between border-b border-[#ECE8F6] pb-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#7064F4]">
                  Editing Scene {activeScene.id} of 5
                </span>
                <h3 className="text-lg font-bold text-[#181820]">
                  {t(activeScene.titleKey as any)}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 rounded-full bg-[#EBE9FD] px-3 py-1 text-xs font-semibold text-[#5243D5]">
                  <Clock className="h-3 w-3" />
                  {activeScene.durationSec} seconds
                </span>
              </div>
            </div>

            {/* Scene Preview Mockup Box */}
            <div className="mt-4 flex aspect-video w-full flex-col items-center justify-center rounded-xl bg-gradient-to-br from-[#F5F3FB] to-[#EBE9FD] p-6 text-center">
              <Film className="h-8 w-8 text-[#7064F4]" />
              <p className="mt-2 text-xs font-medium text-[#181820] max-w-md">
                &ldquo;{activeScene.voiceoverScript}&rdquo;
              </p>
              <span className="mt-1 text-[11px] text-[#6B6A78]">
                Aspect Ratio: {aspectRatio} • Format Target: Meta / TikTok
              </span>
            </div>

            {/* Voiceover Script Input */}
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="voiceover-input"
                  className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#6B6A78]"
                >
                  <Mic className="h-3.5 w-3.5 text-[#7064F4]" />
                  <span>{t('voiceoverLabel')}</span>
                </label>
              </div>
              <textarea
                id="voiceover-input"
                rows={3}
                value={activeScene.voiceoverScript}
                onChange={(e) => updateSceneVoiceover(activeSceneIndex, e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#ECE8F6] bg-[#F5F3FB]/50 px-4 py-2.5 text-sm text-[#181820] placeholder-[#9B99A8] transition-all focus:border-[#7064F4] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7064F4]/20"
              />
            </div>

            {/* Visual Generation Prompt Input */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="visual-prompt-input"
                  className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#6B6A78]"
                >
                  <Sparkles className="h-3.5 w-3.5 text-[#7064F4]" />
                  <span>{t('visualPromptLabel')}</span>
                </label>
              </div>
              <textarea
                id="visual-prompt-input"
                rows={3}
                value={activeScene.visualPrompt}
                onChange={(e) => updateScenePrompt(activeSceneIndex, e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#ECE8F6] bg-[#F5F3FB]/50 px-4 py-2.5 text-sm text-[#181820] placeholder-[#9B99A8] transition-all focus:border-[#7064F4] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7064F4]/20"
              />
            </div>
          </div>

          {/* Asset Selector & Media Library Panel */}
          <div className="rounded-2xl border border-[#ECE8F6] bg-white p-6 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)]">
            <h4 className="text-base font-bold text-[#181820]">
              {t('mediaAssetsTitle')}
            </h4>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="audio-track-select" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#6B6A78]">
                  <Music className="h-3.5 w-3.5 text-[#7064F4]" />
                  <span>{t('audioTrackLabel')}</span>
                </label>
                <select
                  id="audio-track-select"
                  value={selectedAudioTrack}
                  onChange={(e) => setSelectedAudioTrack(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#ECE8F6] bg-[#F5F3FB]/50 px-3.5 py-2 text-sm text-[#181820] transition-all focus:border-[#7064F4] focus:bg-white focus:outline-none"
                >
                  <option value="energetic">{t('trackEnergetic')}</option>
                  <option value="ambient">{t('trackAmbient')}</option>
                  <option value="synthwave">{t('trackSynthwave')}</option>
                </select>
              </div>

              <div>
                <label htmlFor="voice-actor-select" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#6B6A78]">
                  <Mic className="h-3.5 w-3.5 text-[#7064F4]" />
                  <span>{t('voiceActorLabel')}</span>
                </label>
                <select
                  id="voice-actor-select"
                  value={selectedVoiceActor}
                  onChange={(e) => setSelectedVoiceActor(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#ECE8F6] bg-[#F5F3FB]/50 px-3.5 py-2 text-sm text-[#181820] transition-all focus:border-[#7064F4] focus:bg-white focus:outline-none"
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
