'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Clapperboard,
  Film,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Wand2,
} from 'lucide-react';
import {
  AD_STUDIO_MAX_TOTAL_SECONDS,
  assemblyPlan,
  renderAllCost,
  sceneFingerprint,
  sceneVideoStates,
  summarizeVideoProgress,
  voiceDescription,
  type AdStudioAdCopy,
  type AdStudioVoice,
  type AdStudioVideoSettings,
  type AdStudioFormat,
  type AdStudioScene,
  type AdStudioSceneVideoState,
} from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import {
  buildSceneTimeline,
  currentAssembledVideo,
  formatElapsed,
  type AdStudioClipView,
  type AdStudioVideoView,
} from '@/lib/ad-studio/view';
import {
  useAdStudioErrorMessage,
  useAdStudioFailureReason,
  type AdStudioApiError,
} from './use-ad-studio-error';
import { ClipQaNote } from './clip-qa-note';
import { MobileAccordionItem } from './mobile-accordion';
import { AdCopyCard } from './ad-copy-card';
import { NarrationEditor } from './narration-editor';
import { VoicePicker } from './voice-picker';
import { AdvancedVideoSettings } from './advanced-video-settings';

export interface VideoStudioProps {
  orgId: string;
  projectId: string;
  briefId: string;
  /** The saved script - clips are made from what is saved, not from unsaved edits. */
  scenes: AdStudioScene[];
  format: AdStudioFormat;
  language: string;
  /** The ad copy that runs next to the video (KAN-278). */
  videoCopy?: AdStudioAdCopy | null;
  /** The name over the ad in the preview. */
  advertiser?: string;
  /** A text model is configured, so the AI can write the copy. */
  textAvailable?: boolean;
  /** The landing page, shown as its domain in the ad previews. */
  linkUrl?: string | null;
  /** The narrator voice of every scene; null lets the video model choose. */
  voice?: AdStudioVoice | null;
  /** The advanced video settings; null means the defaults. */
  videoSettings?: AdStudioVideoSettings | null;
  initialClips: AdStudioClipView[];
  initialVideos: AdStudioVideoView[];
  /** False when no video model is configured for the deployment. */
  videoAvailable: boolean;
  /** Seconds of video the project may still generate today. */
  videoSecondsLeft: number;
}

const POLL_MS = 4000;

const STATE_TONE: Record<AdStudioSceneVideoState, string> = {
  none: 'bg-muted-foreground/25',
  generating: 'bg-primary animate-pulse',
  ready: 'bg-success',
  out_of_date: 'bg-warning',
  failed: 'bg-destructive',
};

const STATE_BADGE: Record<AdStudioSceneVideoState, string> = {
  none: 'bg-muted text-muted-foreground',
  generating: 'bg-primary/10 text-primary',
  ready: 'bg-success/10 text-success',
  out_of_date: 'bg-warning/15 text-warning',
  failed: 'bg-destructive/10 text-destructive',
};

type Listing = { clips?: AdStudioClipView[]; videos?: AdStudioVideoView[] };

/**
 * The video stage of one ad (KAN-231): a clip per scene rendered by Gemini Omni, conversational
 * edits of a finished clip, the version history, and assembly of the current clips into the
 * finished video. Generation runs on Google's side; while anything is generating this polls the
 * status route, which also moves each clip along. Clips are made from the saved script, so a
 * scene edited after its clip was made shows as out of date.
 */
export function VideoStudio({
  orgId,
  projectId,
  briefId,
  scenes: sceneProp,
  format,
  language,
  initialClips,
  initialVideos,
  videoAvailable,
  videoSecondsLeft,
  videoCopy = null,
  advertiser = '',
  textAvailable = false,
  linkUrl = null,
  voice = null,
  videoSettings = null,
}: VideoStudioProps): React.ReactElement {
  const t = useTranslations('AdStudio');
  const locale = useLocale();
  // The script as saved: a narration edit here comes back vocalized before the page refreshes.
  const [scenes, setScenes] = React.useState(sceneProp);
  React.useEffect(() => setScenes(sceneProp), [sceneProp]);
  // Formatted in the browser only, in the viewer's own time zone, so server and client markup agree.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const formatWhen = (iso: string | null) =>
    iso && mounted
      ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(iso),
        )
      : '';
  const router = useRouter();
  const errorMessage = useAdStudioErrorMessage();
  const failure = useAdStudioFailureReason();
  const [clips, setClips] = React.useState(initialClips);
  const [videos, setVideos] = React.useState(initialVideos);
  const [pending, setPending] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [instructions, setInstructions] = React.useState<Record<string, string>>({});
  const [shown, setShown] = React.useState<Record<string, string>>({});
  const [now, setNow] = React.useState(() => new Date());
  const base = `/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/${briefId}`;

  React.useEffect(() => setClips(initialClips), [initialClips]);
  React.useEffect(() => setVideos(initialVideos), [initialVideos]);

  const [voiceChoice, setVoiceChoice] = React.useState(voice);
  React.useEffect(() => setVoiceChoice(voice), [voice]);
  const [settingsChoice, setSettingsChoice] = React.useState(videoSettings);
  React.useEffect(() => setSettingsChoice(videoSettings), [videoSettings]);
  const context = { format, language, voice: voiceDescription(voiceChoice), settings: settingsChoice };
  const states = sceneVideoStates(scenes, clips, context);
  const progress = summarizeVideoProgress(states, scenes);
  const cost = renderAllCost(states, scenes);
  const plan = assemblyPlan(scenes, clips, context);
  const { latest: finalVideo, current: finalCurrent } = currentAssembledVideo(
    videos,
    plan?.map((entry) => entry.clip.id) ?? null,
  );
  const newestVideo = videos[0] ?? null;
  const generating = clips.some((clip) => clip.status === 'generating');
  // A scene's current clip waiting for its AI check keeps the page polling too: the status route runs the check.
  const awaitingCheck = states.some(
    (state) => state.usable?.status === 'ready' && !state.usable.qa,
  );
  const assembling = pending === 'assemble' || newestVideo?.status === 'assembling';

  const apply = React.useCallback((listing: Listing) => {
    if (listing.clips) setClips(listing.clips);
    if (listing.videos) setVideos(listing.videos);
  }, []);

  const refreshStatus = React.useCallback(async () => {
    try {
      const response = await fetch(`${base}/render-status`, { cache: 'no-store' });
      if (response.ok) apply((await response.json()) as Listing);
    } catch {
      // The next poll tries again.
    }
  }, [apply, base]);

  // Poll while anything is generating or waits for its check; the status route also advances each clip.
  React.useEffect(() => {
    if (!generating && !awaitingCheck) return;
    const poll = setInterval(() => void refreshStatus(), POLL_MS);
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [generating, awaitingCheck, refreshStatus]);

  // When the last clip finishes, refresh the server parts of the page (pipeline stage, usage).
  const wasGenerating = React.useRef(generating);
  React.useEffect(() => {
    if (wasGenerating.current && !generating) {
      setMessage((current) => (current?.tone === 'ok' ? null : current));
      router.refresh();
    }
    wasGenerating.current = generating;
  }, [generating, router]);

  async function act(
    key: string,
    path: string,
    body?: unknown,
    successText?: string,
  ): Promise<void> {
    setPending(key);
    setMessage(null);
    try {
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        ...(body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });
      const result = (await response.json().catch(() => ({}))) as AdStudioApiError & Listing;
      apply(result);
      if (!response.ok) {
        setMessage({ tone: 'error', text: errorMessage(result) });
        await refreshStatus();
      } else if (successText) {
        setMessage({ tone: 'ok', text: successText });
      }
      setNow(new Date());
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: t('errorGeneric') });
    } finally {
      setPending(null);
    }
  }

  if (scenes.length === 0) {
    return (
      <section
        className="flex flex-col gap-2"
        aria-labelledby="ad-studio-video-heading"
        data-testid="ad-studio-video"
      >
        <h2 id="ad-studio-video-heading" className="text-lg font-semibold">
          {t('video.title')}
        </h2>
        <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          {t('video.saveScriptFirst')}
        </p>
      </section>
    );
  }

  const segments = buildSceneTimeline(scenes);
  const overLimit = cost.seconds > videoSecondsLeft;
  const frameClass =
    format === 'vertical' ? 'aspect-[9/16] w-44' : 'aspect-video w-full max-w-sm md:w-80';
  const clipUrl = (clipId: string) => `${base}/clips/${clipId}/media`;

  return (
    <section
      className="flex flex-col gap-5"
      aria-labelledby="ad-studio-video-heading"
      data-testid="ad-studio-video"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="ad-studio-video-heading" className="text-lg font-semibold">
            {t('video.title')}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{t('video.description')}</p>
        </div>
        <div className="flex max-w-xs flex-col items-end gap-1 text-end">
          <AdvancedVideoSettings
            base={base}
            settings={settingsChoice}
            disabled={pending !== null || generating}
            onSaved={(saved) => {
              setSettingsChoice(saved);
              router.refresh();
            }}
          />
          <button
            type="button"
            onClick={() => act('all', '/render-all', undefined, t('video.started'))}
            disabled={!videoAvailable || pending !== null || cost.seconds === 0 || overLimit}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {pending === 'all' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Clapperboard className="h-4 w-4" aria-hidden="true" />
            )}
            {cost.seconds > 0
              ? t('video.renderAll', { seconds: cost.seconds })
              : t('video.renderAllIdle')}
          </button>
          <span
            className={cn('text-xs', overLimit ? 'text-destructive' : 'text-muted-foreground')}
            data-testid="ad-studio-render-all-cost"
          >
            {cost.seconds === 0
              ? t('video.renderAllNothing')
              : overLimit
                ? t('video.renderAllOverLimit', { seconds: cost.seconds, left: videoSecondsLeft })
                : t('video.renderAllCost', { seconds: cost.seconds, left: videoSecondsLeft })}
          </span>
        </div>
      </div>

      {!videoAvailable ? (
        <p
          className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
          role="status"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          {t('video.notConfigured')}
        </p>
      ) : null}
      <p className="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t('video.textNote')}
      </p>
      <VoicePicker
        base={base}
        voice={voiceChoice}
        disabled={pending !== null || generating}
        onSaved={(saved) => {
          setVoiceChoice(saved);
          router.refresh();
        }}
      />

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
          <span className="font-semibold" data-testid="ad-studio-video-progress">
            {t('video.progress', { rendered: progress.rendered, total: progress.scenes })}
          </span>
          <span className="flex flex-wrap gap-3 text-muted-foreground">
            {(['ready', 'generating', 'out_of_date', 'failed', 'none'] as const).map((state) => (
              <span key={state} className="inline-flex items-center gap-1">
                <span
                  className={cn('h-2 w-2 rounded-full', STATE_TONE[state])}
                  aria-hidden="true"
                />
                {t(`video.legend.${state}`)}
              </span>
            ))}
          </span>
        </div>
        <div
          className="flex h-6 w-full overflow-hidden rounded-lg bg-muted"
          dir="ltr"
          role="img"
          aria-label={t('video.rulerLabel')}
        >
          {segments.map((segment, index) => (
            <div
              key={segment.id}
              className={cn(
                'flex h-full items-center justify-center border-e border-background text-[10px] font-semibold text-white',
                STATE_TONE[states[index].state],
              )}
              style={{ width: `${Math.min(segment.widthPercent, 100)}%` }}
              title={`${t('sceneLabel', { number: segment.position })} · ${t(`video.legend.${states[index].state}`)}`}
            >
              {segment.widthPercent >= 6 ? segment.position : null}
            </div>
          ))}
        </div>
        <div
          className="flex justify-between text-[10px] text-muted-foreground tabular-nums"
          dir="ltr"
          aria-hidden="true"
        >
          {[0, 15, 30, 45, AD_STUDIO_MAX_TOTAL_SECONDS].map((mark) => (
            <span key={mark} dir="auto">
              {t('secondsShort', { seconds: mark })}
            </span>
          ))}
        </div>
      </div>

      <ol className="flex flex-col gap-3">
        {scenes.map((scene, index) => {
          const state = states[index];
          const history = clips
            .filter((clip) => clip.sceneId === scene.id)
            .sort((a, b) => b.version - a.version);
          const inFlight = history.find((clip) => clip.status === 'generating') ?? null;
          const readyClips = history.filter((clip) => clip.status === 'ready');
          const shownClip =
            readyClips.find((clip) => clip.id === shown[scene.id]) ??
            state.usable ??
            readyClips[0] ??
            null;
          const shownIsStale =
            shownClip !== null && shownClip.sceneFingerprint !== sceneFingerprint(scene, context);
          const instruction = instructions[scene.id] ?? '';
          const canRender =
            videoAvailable &&
            pending === null &&
            !inFlight &&
            scene.durationSeconds <= videoSecondsLeft;
          const lastFailed = history[0]?.status === 'failed' ? history[0] : null;
          return (
            <MobileAccordionItem
              key={scene.id}
              defaultOpen={index === 0}
              toggleLabel={t('sceneLabel', { number: index + 1 })}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm"
              bodyClassName="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]"
              testId={`ad-studio-video-scene-${index + 1}`}
              summary={
                <>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold">
                    {t('sceneLabel', { number: index + 1 })}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t('video.sceneSeconds', { seconds: scene.durationSeconds })}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      STATE_BADGE[state.state],
                    )}
                  >
                    {t(`video.legend.${state.state}`)}
                  </span>
                  {shownClip?.qa ? (
                    <span className="text-[11px] text-muted-foreground">
                      {t(`video.qa.short.${shownClip.qa.status}`)}
                    </span>
                  ) : null}
                </>
              }
            >
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 max-md:hidden">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold">
                    {t('sceneLabel', { number: index + 1 })}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t('video.sceneSeconds', { seconds: scene.durationSeconds })}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      STATE_BADGE[state.state],
                    )}
                    data-testid="ad-studio-scene-video-state"
                  >
                    {t(`video.legend.${state.state}`)}
                  </span>
                </div>
                <NarrationEditor
                  orgId={orgId}
                  projectId={projectId}
                  briefId={briefId}
                  scenes={scenes}
                  sceneId={scene.id}
                  language={language}
                  onSaved={setScenes}
                />

                {inFlight ? (
                  <div
                    className="flex flex-col gap-1 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2"
                    role="status"
                  >
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      {t('video.generating', { elapsed: formatElapsed(inFlight.requestedOn, now) })}
                    </span>
                    <span
                      className="h-1 overflow-hidden rounded-full bg-primary/15"
                      aria-hidden="true"
                    >
                      <span className="block h-full w-1/3 animate-pulse rounded-full bg-primary" />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t('video.generatingHint')}
                    </span>
                  </div>
                ) : null}
                {!inFlight && lastFailed ? (
                  <p className="text-sm text-destructive" data-testid="ad-studio-clip-failure">
                    {t('video.failed', { reason: failure.clip(lastFailed.failureReason) })}
                  </p>
                ) : null}
                {shownClip && !inFlight ? <ClipQaNote clip={shownClip} /> : null}
                {state.state === 'out_of_date' ? (
                  <p
                    className="flex items-start gap-1.5 text-xs text-warning"
                    data-testid="ad-studio-out-of-date"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {t('video.outOfDateHint')}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      act(
                        `render:${scene.id}`,
                        `/scenes/${scene.id}/render`,
                        undefined,
                        t('video.started'),
                      )
                    }
                    disabled={!canRender}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                  >
                    {pending === `render:${scene.id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {readyClips.length > 0 || lastFailed
                      ? t('video.rerender', { seconds: scene.durationSeconds })
                      : t('video.render', { seconds: scene.durationSeconds })}
                  </button>
                  {videoAvailable && !inFlight && scene.durationSeconds > videoSecondsLeft ? (
                    <span className="text-xs text-destructive">{t('video.overLimitScene')}</span>
                  ) : null}
                </div>

                {readyClips.length > 0 ? (
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    {t('video.editLabel')}
                    <span className="flex gap-2">
                      <input
                        value={instruction}
                        onChange={(event) =>
                          setInstructions((current) => ({
                            ...current,
                            [scene.id]: event.target.value,
                          }))
                        }
                        placeholder={t('video.editPlaceholder')}
                        maxLength={500}
                        dir="auto"
                        className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          await act(
                            `edit:${scene.id}`,
                            `/scenes/${scene.id}/edit`,
                            { instruction },
                            t('video.started'),
                          );
                          setInstructions((current) => ({ ...current, [scene.id]: '' }));
                        }}
                        disabled={
                          !videoAvailable ||
                          pending !== null ||
                          inFlight !== null ||
                          instruction.trim().length === 0
                        }
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        {pending === `edit:${scene.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {pending === `edit:${scene.id}` ? t('video.editing') : t('video.editRun')}
                      </button>
                    </span>
                  </label>
                ) : null}

                {history.length > 0 ? (
                  <details className="text-xs" data-testid="ad-studio-versions">
                    <summary className="cursor-pointer font-medium text-muted-foreground">
                      {t('video.versions', { count: history.length })}
                    </summary>
                    <ul className="mt-2 flex flex-col gap-1">
                      {history.map((clip) => (
                        <li
                          key={clip.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-2 py-1.5"
                        >
                          <span className="min-w-0">
                            <span className="font-semibold">
                              {t('video.versionLabel', { version: clip.version })}
                            </span>
                            <span className="text-muted-foreground"> · </span>
                            <span className="text-muted-foreground" dir="auto">
                              {clip.kind === 'edit'
                                ? t('video.versionEdit', { instruction: clip.instruction ?? '' })
                                : t('video.versionRender')}
                            </span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span
                              className={cn(
                                clip.status === 'failed'
                                  ? 'text-destructive'
                                  : clip.status === 'ready'
                                    ? 'text-success'
                                    : 'text-primary',
                              )}
                            >
                              {t(`video.versionStatus.${clip.status}`)}
                            </span>
                            {clip.status === 'ready' ? (
                              shownClip?.id === clip.id ? (
                                <span className="text-muted-foreground">{t('video.showing')}</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setShown((current) => ({ ...current, [scene.id]: clip.id }))
                                  }
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                  <Play className="h-3 w-3" aria-hidden="true" />
                                  {t('video.show')}
                                </button>
                              )
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>

              <div className="flex justify-center md:justify-end">
                {shownClip ? (
                  <div className="relative">
                    <video
                      key={shownClip.id}
                      src={clipUrl(shownClip.id)}
                      controls
                      playsInline
                      preload="metadata"
                      className={cn('rounded-xl bg-black object-contain', frameClass)}
                      aria-label={t('video.clipPlayer', {
                        number: index + 1,
                        version: shownClip.version,
                      })}
                      data-testid="ad-studio-clip-player"
                    />
                    {shownIsStale ? (
                      <span
                        className="absolute start-2 top-2 rounded-full bg-warning px-2 py-0.5 text-[11px] font-semibold text-warning-foreground shadow"
                        data-testid="ad-studio-out-of-date-badge"
                      >
                        {t('video.outOfDate')}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div
                    className={cn(
                      'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-2 text-center text-xs',
                      inFlight
                        ? 'border-primary/40 bg-primary/5 text-primary'
                        : 'border-border bg-muted/30 text-muted-foreground',
                      frameClass,
                    )}
                  >
                    {inFlight ? (
                      <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                    ) : (
                      <Film className="h-6 w-6" aria-hidden="true" />
                    )}
                    {inFlight ? t('video.legend.generating') : t('video.noClip')}
                  </div>
                )}
              </div>
            </MobileAccordionItem>
          );
        })}
      </ol>

      <div
        className="flex flex-col gap-4 rounded-2xl border border-border bg-muted/20 p-4"
        data-testid="ad-studio-final"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-base font-semibold">{t('video.finalTitle')}</h3>
            {!progress.canAssemble ? (
              <p className="text-xs text-muted-foreground">{t('video.assembleHint')}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => act('assemble', '/assemble', undefined, t('video.assembled'))}
            disabled={!progress.canAssemble || pending !== null || assembling || generating}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {assembling ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Film className="h-4 w-4" aria-hidden="true" />
            )}
            {assembling ? t('video.assembling') : t('video.assemble')}
          </button>
        </div>
        {newestVideo?.status === 'failed' ? (
          <p className="text-sm text-destructive">
            {t('video.finalFailed', { reason: failure.video(newestVideo.failureReason) })}
          </p>
        ) : null}
        {finalVideo ? (
          <div className="flex flex-col items-center gap-2">
            <div className={cn('w-full', format === 'vertical' ? 'max-w-xs' : 'max-w-2xl')}>
              <AdCopyCard
                orgId={orgId}
                projectId={projectId}
                briefId={briefId}
                copyKey="video"
                copy={videoCopy}
                advertiser={advertiser}
                aiAvailable={textAvailable}
                linkUrl={linkUrl}
                preview={{
                  kind: 'video',
                  src: `${base}/videos/${finalVideo.id}/media`,
                  vertical: format === 'vertical',
                  label: t('video.finalTitle'),
                  testId: 'ad-studio-final-player',
                }}
              />
            </div>
            <p
              className="text-xs text-muted-foreground tabular-nums"
              data-testid="ad-studio-final-meta"
            >
              {t('video.finalMeta', {
                seconds: Math.round(finalVideo.durationSeconds * 10) / 10,
                when: formatWhen(finalVideo.assembledOn),
              })}
            </p>
            {!finalCurrent ? (
              <p className="flex items-center gap-1.5 text-xs text-warning">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {t('video.finalOutOfDate')}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t('video.noFinal')}</p>
            <div className="w-full max-w-md">
              <AdCopyCard
                orgId={orgId}
                projectId={projectId}
                briefId={briefId}
                copyKey="video"
                copy={videoCopy}
                advertiser={advertiser}
                aiAvailable={textAvailable}
              />
            </div>
          </div>
        )}
      </div>

      {message ? (
        <p
          role="status"
          className={cn('text-sm', message.tone === 'ok' ? 'text-success' : 'text-destructive')}
          data-testid="ad-studio-video-message"
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
