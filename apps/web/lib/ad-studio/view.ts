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
 * Where one ad stands in brief -> script -> video -> export. A brief always exists; the script is
 * done once it has scenes; the video is done once the current clips of every scene are assembled.
 * Export is a later stage of the studio and reads as upcoming.
 */
export function adStudioStages(brief: { scenes: readonly unknown[] }, video?: AdStudioVideoStageProgress): AdStudioStage[] {
  const scripted = brief.scenes.length > 0;
  return [
    { id: 'brief', status: 'done' },
    { id: 'script', status: scripted ? 'done' : 'current' },
    { id: 'video', status: !scripted ? 'upcoming' : video?.assembled ? 'done' : 'current' },
    { id: 'export', status: 'upcoming' },
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
