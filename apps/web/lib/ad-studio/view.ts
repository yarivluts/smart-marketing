import {
  AD_STUDIO_MAX_TOTAL_SECONDS,
  totalSceneSeconds,
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
  id: 'brief' | 'plan' | 'script' | 'video' | 'export';
  status: AdStudioStageStatus;
}

/**
 * Where one ad stands in brief -> plan -> script -> video -> export. A brief always exists; the plan
 * (KAN-230) is done once deep analysis ran, and reads as skipped when a script was written without
 * one; the script is done once it has scenes. Video and export are later stages of the studio and
 * read as upcoming until they have something to show.
 */
export function adStudioStages(brief: { scenes: readonly unknown[]; plan?: unknown }): AdStudioStage[] {
  const scripted = brief.scenes.length > 0;
  const planned = brief.plan !== null && brief.plan !== undefined;
  return [
    { id: 'brief', status: 'done' },
    { id: 'plan', status: planned ? 'done' : scripted ? 'skipped' : 'current' },
    { id: 'script', status: scripted ? 'done' : planned ? 'current' : 'upcoming' },
    { id: 'video', status: scripted ? 'current' : 'upcoming' },
    { id: 'export', status: 'upcoming' },
  ];
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
