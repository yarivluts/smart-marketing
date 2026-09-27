import { randomUUID } from 'node:crypto';
import {
  AdStudioClipModel,
  AdStudioVideoModel,
  type AdStudioClipKind,
} from '../models/ad-studio.model';

/**
 * Ad Studio clips and assembled videos (KAN-231). Generation is advanced by the page polling a
 * status route - there is no job queue - so every step here is written to be repeated safely:
 * state changes re-read the clip first and never move a finished clip back, and a short lease keeps
 * two concurrent polls from doing the same slow step (download + upload) at once.
 *
 * The lease is best-effort, not a transaction: this ORM exposes no transaction primitive (see
 * `claimTvPairing` in `tv-pairing.service.ts`). It is written, then read back, and only the caller
 * whose token survived proceeds. Two polls interleaving exactly between one's read and the other's
 * write can both proceed; that costs a duplicate download, never a wrong result, because the
 * object path is fixed per clip and marking a clip ready is idempotent.
 */

export class AdStudioClipNotFoundError extends Error {
  constructor() {
    super('Ad Studio clip not found.');
    this.name = 'AdStudioClipNotFoundError';
  }
}

export class AdStudioVideoNotFoundError extends Error {
  constructor() {
    super('Ad Studio video not found.');
    this.name = 'AdStudioVideoNotFoundError';
  }
}

/** A clip cannot be edited until it is ready and its Gemini interaction is known. */
export class AdStudioClipNotEditableError extends Error {
  constructor() {
    super('Only a finished clip can be edited.');
    this.name = 'AdStudioClipNotEditableError';
  }
}

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function pathParams(organizationId: string, projectId: string) {
  return { organization_id: organizationId, project_id: projectId };
}

/** Every clip of a brief, oldest first. Queried by brief only (single-field index) and sorted here. */
export async function listAdStudioClips(organizationId: string, projectId: string, briefId: string): Promise<AdStudioClipModel[]> {
  const clips = await AdStudioClipModel.initPath(pathParams(organizationId, projectId)).where('brief_id', '==', briefId).get();
  return clips.sort((a, b) => a.requested_on.localeCompare(b.requested_on) || a.version - b.version);
}

export async function getAdStudioClip(organizationId: string, projectId: string, briefId: string, clipId: string): Promise<AdStudioClipModel> {
  const clip = await AdStudioClipModel.init(clipId, pathParams(organizationId, projectId));
  if (!clip || clip.brief_id !== briefId || clip.project_id !== projectId) throw new AdStudioClipNotFoundError();
  return clip;
}

/**
 * Records a clip as `generating` before the model is called, so a failed start is visible on the
 * page as a failed version rather than vanishing. Its version is one past the scene's newest.
 */
export async function createAdStudioClip(params: {
  organizationId: string;
  projectId: string;
  briefId: string;
  sceneId: string;
  sceneFingerprint: string;
  kind: AdStudioClipKind;
  parentClipId?: string | null;
  prompt: string;
  model: string;
  aspectRatio: string;
  durationSeconds: number;
  requestedBy: string;
  now?: Date;
}): Promise<AdStudioClipModel> {
  const existing = await listAdStudioClips(params.organizationId, params.projectId, params.briefId);
  const version = existing.filter((clip) => clip.scene_id === params.sceneId).reduce((max, clip) => Math.max(max, clip.version), 0) + 1;
  const clip = new AdStudioClipModel();
  clip.organization_id = params.organizationId;
  clip.project_id = params.projectId;
  clip.brief_id = params.briefId;
  clip.scene_id = params.sceneId;
  clip.scene_fingerprint = params.sceneFingerprint;
  clip.kind = params.kind;
  clip.version = version;
  clip.parent_clip_id = params.parentClipId ?? null;
  clip.prompt = params.prompt;
  clip.model = params.model;
  clip.aspect_ratio = params.aspectRatio;
  clip.interaction_id = null;
  clip.file_name = null;
  clip.status = 'generating';
  clip.failure_reason = null;
  clip.duration_seconds = params.durationSeconds;
  clip.gcs_path = null;
  clip.requested_by = params.requestedBy;
  clip.requested_on = nowIso(params.now);
  clip.completed_on = null;
  clip.lease_token = null;
  clip.lease_until = null;
  clip.setPathParams(pathParams(params.organizationId, params.projectId));
  await clip.save();
  return clip;
}

async function reload(clip: Pick<AdStudioClipModel, 'id' | 'organization_id' | 'project_id' | 'brief_id'>): Promise<AdStudioClipModel> {
  return getAdStudioClip(clip.organization_id, clip.project_id, clip.brief_id, clip.id);
}

/** Stores what the model's start call returned. Ignored once the clip has finished. */
export async function recordAdStudioClipProgress(
  clip: Pick<AdStudioClipModel, 'id' | 'organization_id' | 'project_id' | 'brief_id'>,
  progress: { interactionId?: string | null; fileName?: string | null },
): Promise<AdStudioClipModel> {
  const fresh = await reload(clip);
  if (fresh.status !== 'generating') return fresh;
  if (progress.interactionId !== undefined) fresh.interaction_id = progress.interactionId;
  if (progress.fileName !== undefined) fresh.file_name = progress.fileName;
  await fresh.save();
  return fresh;
}

/** Marks a clip ready with its stored object. Idempotent; a failed clip stays failed. */
export async function markAdStudioClipReady(
  clip: Pick<AdStudioClipModel, 'id' | 'organization_id' | 'project_id' | 'brief_id'>,
  params: { gcsPath: string; now?: Date },
): Promise<AdStudioClipModel> {
  const fresh = await reload(clip);
  if (fresh.status !== 'generating') return fresh;
  fresh.status = 'ready';
  fresh.gcs_path = params.gcsPath;
  fresh.failure_reason = null;
  fresh.completed_on = nowIso(params.now);
  fresh.lease_token = null;
  fresh.lease_until = null;
  await fresh.save();
  return fresh;
}

/** Marks a clip failed with a reason code. Idempotent; a ready clip stays ready. */
export async function markAdStudioClipFailed(
  clip: Pick<AdStudioClipModel, 'id' | 'organization_id' | 'project_id' | 'brief_id'>,
  reason: string,
  now?: Date,
): Promise<AdStudioClipModel> {
  const fresh = await reload(clip);
  if (fresh.status !== 'generating') return fresh;
  fresh.status = 'failed';
  fresh.failure_reason = reason;
  fresh.completed_on = nowIso(now);
  fresh.lease_token = null;
  fresh.lease_until = null;
  await fresh.save();
  return fresh;
}

/**
 * Takes the clip's lease for `ttlMs` if no one holds an unexpired one and the clip is still
 * generating; returns the token to release with, or null. See the file comment for its limits.
 */
export async function acquireAdStudioClipLease(
  clip: Pick<AdStudioClipModel, 'id' | 'organization_id' | 'project_id' | 'brief_id'>,
  params: { ttlMs: number; now?: Date },
): Promise<string | null> {
  const now = params.now ?? new Date();
  const fresh = await reload(clip);
  if (fresh.status !== 'generating') return null;
  if (fresh.lease_until && fresh.lease_until > now.toISOString()) return null;
  const token = randomUUID();
  fresh.lease_token = token;
  fresh.lease_until = new Date(now.getTime() + params.ttlMs).toISOString();
  await fresh.save();
  const check = await reload(clip);
  return check.lease_token === token ? token : null;
}

/** Gives the lease back early, only if this caller still holds it. */
export async function releaseAdStudioClipLease(clip: Pick<AdStudioClipModel, 'id' | 'organization_id' | 'project_id' | 'brief_id'>, token: string): Promise<void> {
  const fresh = await reload(clip);
  if (fresh.lease_token !== token) return;
  fresh.lease_token = null;
  fresh.lease_until = null;
  await fresh.save();
}

/** Every assembled video of a brief, newest first. */
export async function listAdStudioVideos(organizationId: string, projectId: string, briefId: string): Promise<AdStudioVideoModel[]> {
  const videos = await AdStudioVideoModel.initPath(pathParams(organizationId, projectId)).where('brief_id', '==', briefId).get();
  return videos.sort((a, b) => b.requested_on.localeCompare(a.requested_on));
}

export async function getAdStudioVideo(organizationId: string, projectId: string, briefId: string, videoId: string): Promise<AdStudioVideoModel> {
  const video = await AdStudioVideoModel.init(videoId, pathParams(organizationId, projectId));
  if (!video || video.brief_id !== briefId || video.project_id !== projectId) throw new AdStudioVideoNotFoundError();
  return video;
}

export async function createAdStudioVideo(params: {
  organizationId: string;
  projectId: string;
  briefId: string;
  clipIds: string[];
  sceneIds: string[];
  aspectRatio: string;
  durationSeconds: number;
  requestedBy: string;
  now?: Date;
}): Promise<AdStudioVideoModel> {
  const video = new AdStudioVideoModel();
  video.organization_id = params.organizationId;
  video.project_id = params.projectId;
  video.brief_id = params.briefId;
  video.clip_ids = [...params.clipIds];
  video.scene_ids = [...params.sceneIds];
  video.aspect_ratio = params.aspectRatio;
  video.status = 'assembling';
  video.failure_reason = null;
  video.duration_seconds = params.durationSeconds;
  video.gcs_path = null;
  video.requested_by = params.requestedBy;
  video.requested_on = nowIso(params.now);
  video.assembled_on = null;
  video.setPathParams(pathParams(params.organizationId, params.projectId));
  await video.save();
  return video;
}

export async function markAdStudioVideoReady(
  video: Pick<AdStudioVideoModel, 'id' | 'organization_id' | 'project_id' | 'brief_id'>,
  params: { gcsPath: string; durationSeconds: number; now?: Date },
): Promise<AdStudioVideoModel> {
  const fresh = await getAdStudioVideo(video.organization_id, video.project_id, video.brief_id, video.id);
  if (fresh.status !== 'assembling') return fresh;
  fresh.status = 'ready';
  fresh.gcs_path = params.gcsPath;
  fresh.duration_seconds = params.durationSeconds;
  fresh.assembled_on = nowIso(params.now);
  await fresh.save();
  return fresh;
}

export async function markAdStudioVideoFailed(
  video: Pick<AdStudioVideoModel, 'id' | 'organization_id' | 'project_id' | 'brief_id'>,
  reason: string,
  now?: Date,
): Promise<AdStudioVideoModel> {
  const fresh = await getAdStudioVideo(video.organization_id, video.project_id, video.brief_id, video.id);
  if (fresh.status !== 'assembling') return fresh;
  fresh.status = 'failed';
  fresh.failure_reason = reason;
  fresh.assembled_on = nowIso(now);
  await fresh.save();
  return fresh;
}

/** Removes every clip and video record of a brief (the caller removes the stored files). */
export async function deleteAdStudioBriefMedia(organizationId: string, projectId: string, briefId: string): Promise<number> {
  const [clips, videos] = await Promise.all([listAdStudioClips(organizationId, projectId, briefId), listAdStudioVideos(organizationId, projectId, briefId)]);
  await Promise.all([...clips.map((clip) => clip.remove()), ...videos.map((video) => video.remove())]);
  return clips.length + videos.length;
}
