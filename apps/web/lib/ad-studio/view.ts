import { AD_STUDIO_MAX_TOTAL_SECONDS, totalSceneSeconds, type AdStudioScene } from '@growthos/shared';

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

export type AdStudioStageStatus = 'done' | 'current' | 'upcoming';

export interface AdStudioStage {
  id: 'brief' | 'script' | 'video' | 'export';
  status: AdStudioStageStatus;
}

/**
 * Where one ad stands in brief -> script -> video -> export. A brief always exists; the script is
 * done once it has scenes. Video and export are later stages of the studio and read as upcoming
 * until they have something to show.
 */
export function adStudioStages(brief: { scenes: readonly unknown[] }): AdStudioStage[] {
  const scripted = brief.scenes.length > 0;
  return [
    { id: 'brief', status: 'done' },
    { id: 'script', status: scripted ? 'done' : 'current' },
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
