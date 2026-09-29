import {
  AD_STUDIO_MAX_TOTAL_SECONDS,
  imageConceptFingerprint,
  totalSceneSeconds,
  type AdStudioImageConcept,
  type AdStudioImageFormat,
  type AdStudioEvidenceSource,
  type AdStudioPlanRecommendation,
  type AdStudioPlanSources,
  type AdStudioScene,
} from '@growthos/shared';

/**
 * Pure shaping for the Ad Studio page (KAN-229): nothing here reads data or talks to a model, so it
 * is unit-tested directly and shared by the server page and the client editor.
 */

export interface TimelineSegment {
  id: string;
  position: number;
  durationSeconds: number;
  /** Start offset within the 60-second frame, in seconds. */
  startSeconds: number;
  /** Width as a share of the 60-second frame, 0-100. */
  widthPercent: number;
  /** True for any part of the scene that runs past the 60-second limit. */
  overLimit: boolean;
}

/** The scenes laid out on a fixed 60-second ruler, so how much of the minute is used reads at a glance. */
export function buildSceneTimeline(scenes: readonly Pick<AdStudioScene, 'id' | 'durationSeconds'>[]): TimelineSegment[] {
  let start = 0;
  return scenes.map((scene, index) => {
    const duration = Number.isFinite(scene.durationSeconds) ? Math.max(0, scene.durationSeconds) : 0;
    const segment: TimelineSegment = {
      id: scene.id,
      position: index + 1,
      durationSeconds: duration,
      startSeconds: start,
      widthPercent: (duration / AD_STUDIO_MAX_TOTAL_SECONDS) * 100,
      overLimit: start + duration > AD_STUDIO_MAX_TOTAL_SECONDS,
    };
    start += duration;
    return segment;
  });
}

export type AdStudioStageStatus = 'done' | 'current' | 'upcoming' | 'skipped';

export interface AdStudioStage {
  id: 'brief' | 'plan' | 'script' | 'images' | 'video' | 'export';
  status: AdStudioStageStatus;
}

/** A scene clip as the page receives it (KAN-231). */
export interface AdStudioClipView {
  id: string;
  sceneId: string;
  version: number;
  kind: 'render' | 'edit';
  status: 'generating' | 'ready' | 'failed';
  failureReason: string | null;
  sceneFingerprint: string;
  durationSeconds: number;
  parentClipId: string | null;
  /** The edit instruction (edits only). */
  instruction: string | null;
  requestedOn: string;
  completedOn: string | null;
}

/** A generated ad image as the page receives it. */
export interface AdStudioImageView {
  id: string;
  conceptId: string;
  format: AdStudioImageFormat;
  kind: 'render' | 'edit';
  version: number;
  status: 'generating' | 'ready' | 'failed';
  selected: boolean;
  parentImageId: string | null;
  instruction: string | null;
  conceptFingerprint: string;
  failureCode: string | null;
  mimeType: string | null;
  requestedOn: string;
  completedOn: string | null;
}

/** One concept in one placement: its versions, the chosen one, and whether that one still matches the concept. */
export interface AdStudioImageSlot {
  conceptId: string;
  format: AdStudioImageFormat;
  /** Newest first. */
  versions: AdStudioImageView[];
  selected: AdStudioImageView | null;
  /** True when the chosen image was rendered from the concept as it reads now. */
  current: boolean;
  generating: boolean;
}

/** Every concept x placement the brief asks for, in concept order. Images of removed concepts or placements are not slots. */
export function adStudioImageSlots(
  concepts: readonly Pick<AdStudioImageConcept, 'id' | 'visualPrompt' | 'headline' | 'formats'>[],
  images: readonly AdStudioImageView[],
  language: string,
): AdStudioImageSlot[] {
  const slots: AdStudioImageSlot[] = [];
  for (const concept of concepts) {
    for (const format of concept.formats) {
      const versions = images.filter((image) => image.conceptId === concept.id && image.format === format).sort((a, b) => b.version - a.version);
      const selected = versions.find((image) => image.selected && image.status === 'ready') ?? null;
      const fingerprint = imageConceptFingerprint(concept, format, language);
      slots.push({
        conceptId: concept.id,
        format,
        versions,
        selected,
        // An edit keeps its parent's fingerprint, so an edited image of the current concept is current too.
        current: Boolean(selected && selected.conceptFingerprint === fingerprint),
        generating: versions.some((image) => image.status === 'generating'),
      });
    }
  }
  return slots;
}

/**
 * The renders still needed so every slot has an image of the concept as it reads now: slots with
 * no current image and nothing in flight. `failedSince` skips slots whose current-fingerprint render
 * already failed after that time (the autopilot tries each once per run instead of looping).
 */
export function missingImageRenders(slots: readonly AdStudioImageSlot[], concepts: readonly Pick<AdStudioImageConcept, 'id' | 'visualPrompt' | 'headline'>[], language: string, failedSince?: string): { conceptId: string; format: AdStudioImageFormat }[] {
  const byId = new Map(concepts.map((concept) => [concept.id, concept]));
  return slots
    .filter((slot) => {
      if (slot.current || slot.generating) return false;
      const concept = byId.get(slot.conceptId);
      if (!concept) return false;
      const fingerprint = imageConceptFingerprint(concept, slot.format, language);
      if (slot.versions.some((image) => image.status === 'ready' && image.conceptFingerprint === fingerprint)) return false;
      if (failedSince && slot.versions.some((image) => image.status === 'failed' && image.conceptFingerprint === fingerprint && image.requestedOn >= failedSince)) return false;
      return true;
    })
    .map((slot) => ({ conceptId: slot.conceptId, format: slot.format }));
}

/** An autopilot run as the page and MCP receive it. */
export interface AdStudioRunView {
  id: string;
  status: 'running' | 'awaiting_approval' | 'done' | 'failed' | 'cancelled';
  options: { plan: boolean; images: boolean; imageFormats: AdStudioImageFormat[]; video: boolean; environmentId: string | null; confirmPlan: boolean };
  steps: { id: 'plan' | 'script' | 'image_concepts' | 'images' | 'clips' | 'assemble'; status: 'pending' | 'running' | 'done' | 'skipped' | 'failed'; reason: string | null; progress: { done: number; total: number } | null }[];
  failureCode: string | null;
  failureMessage: string | null;
  startedOn: string;
  lastAdvancedOn: string;
  finishedOn: string | null;
  /** When the person confirmed the plan (runs with confirmPlan), or null. */
  planApprovedOn: string | null;
}

/** An assembled video as the page receives it (KAN-231). */
export interface AdStudioVideoView {
  id: string;
  status: 'assembling' | 'ready' | 'failed';
  failureReason: string | null;
  clipIds: string[];
  durationSeconds: number;
  requestedOn: string;
  assembledOn: string | null;
}

/** How far the video stage has come (KAN-231). */
export interface AdStudioVideoStageProgress {
  /** Scenes with a ready clip made from the scene as it is now. */
  rendered: number;
  scenes: number;
  /** True when the newest assembled video uses exactly the current clips. */
  assembled: boolean;
}

/**
 * Where one ad stands in brief -> plan -> script -> images -> video -> export. A brief always exists; the plan
 * (KAN-230) is done once deep analysis ran, and reads as skipped when a script was written without
 * one; the script is done once it has scenes; the video (KAN-231) is done once the current clips of
 * every scene are assembled; export (KAN-232) is current once that video exists and done after an
 * upload succeeded. Images are done when every idea has a current image in each of its placements,
 * current while some are missing, and upcoming until there are ideas.
 */
export function adStudioStages(
  brief: { scenes: readonly unknown[]; plan?: unknown },
  video?: AdStudioVideoStageProgress,
  exported = false,
  images?: { current: number; total: number } | null,
): AdStudioStage[] {
  const scripted = brief.scenes.length > 0;
  const planned = brief.plan !== null && brief.plan !== undefined;
  return [
    { id: 'brief', status: 'done' },
    { id: 'plan', status: planned ? 'done' : scripted ? 'skipped' : 'current' },
    { id: 'script', status: scripted ? 'done' : planned ? 'current' : 'upcoming' },
    { id: 'images', status: !images || images.total === 0 ? 'upcoming' : images.current === images.total ? 'done' : 'current' },
    { id: 'video', status: !scripted ? 'upcoming' : video?.assembled ? 'done' : 'current' },
    { id: 'export', status: exported ? 'done' : scripted && video?.assembled ? 'current' : 'upcoming' },
  ];
}

/**
 * The newest successfully assembled video, and whether it is made of exactly the clips an assembly
 * would use now (`planClipIds`, null when the scenes are not all rendered). A video is current only
 * then - after any re-render, edit or script change it is shown as out of date.
 */
export function currentAssembledVideo<T extends { status: string; clipIds: readonly string[] }>(
  videos: readonly T[],
  planClipIds: readonly string[] | null,
): { latest: T | null; current: boolean } {
  const latest = videos.find((video) => video.status === 'ready') ?? null;
  const current = Boolean(latest && planClipIds && latest.clipIds.length === planClipIds.length && latest.clipIds.every((id, index) => id === planClipIds[index]));
  return { latest, current };
}

/** Elapsed time as m:ss, for a clip that is still generating. */
export function formatElapsed(fromIso: string, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(fromIso).getTime()) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export interface AdStudioOverview {
  briefs: number;
  scripted: number;
  /** Total seconds across every scripted ad. */
  scriptedSeconds: number;
}

export function summarizeAdStudio(briefs: readonly { scenes: readonly Pick<AdStudioScene, 'durationSeconds'>[] }[]): AdStudioOverview {
  const scriptedBriefs = briefs.filter((brief) => brief.scenes.length > 0);
  return {
    briefs: briefs.length,
    scripted: scriptedBriefs.length,
    scriptedSeconds: scriptedBriefs.reduce((sum, brief) => sum + totalSceneSeconds(brief.scenes), 0),
  };
}

/** Share of a daily limit used, 0-100 (a limit of 0 reads as full). */
export function limitUsedPercent(used: number, limit: number): number {
  if (limit <= 0) return 100;
  return Math.min(100, Math.round((used / limit) * 100));
}

export interface PlanningSourceRow {
  id: AdStudioEvidenceSource | 'market';
  /** `model` for market knowledge: always present, never measured. */
  status: 'ok' | 'unavailable' | 'model';
  reason: string | null;
}

/** The data-sources checklist of a plan: the four gathered sources in a fixed order, then market knowledge. */
export function planningSourceChecklist(sources: AdStudioPlanSources): PlanningSourceRow[] {
  const states: [AdStudioEvidenceSource, { status: 'ok' } | { status: 'unavailable'; reason: string }][] = [
    ['landing_page', sources.landingPage],
    ['results', sources.results],
    ['campaigns', sources.campaigns],
    ['keywords', sources.keywords],
  ];
  return [
    ...states.map(([id, state]) => ({ id, status: state.status, reason: state.status === 'unavailable' ? state.reason : null })),
    { id: 'market' as const, status: 'model' as const, reason: null },
  ];
}

const PRIORITY_RANK: Record<AdStudioPlanRecommendation['priority'], number> = { high: 0, medium: 1, low: 2 };

/** Recommendations high priority first, keeping the model's order within a priority. */
export function sortRecommendations(recommendations: readonly AdStudioPlanRecommendation[]): AdStudioPlanRecommendation[] {
  return recommendations
    .map((recommendation, index) => ({ recommendation, index }))
    .sort((a, b) => PRIORITY_RANK[a.recommendation.priority] - PRIORITY_RANK[b.recommendation.priority] || a.index - b.index)
    .map(({ recommendation }) => recommendation);
}

/** A landing page URL as a chart label: no protocol, no trailing slash. Anything that is not a URL is kept as is. */
export function shortUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value.replace(/^https?:\/\//i, '').replace(/\/$/, '') : value;
}
