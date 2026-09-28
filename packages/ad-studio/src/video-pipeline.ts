import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  AD_STUDIO_ASPECT_RATIO,
  assemblyPlan,
  buildSceneEditInstruction,
  buildScenePrompt,
  renderAllCost,
  sceneFingerprint,
  sceneVideoStates,
  type AdStudioClipSummary,
  type AdStudioVideoContext,
} from '@growthos/shared';
import {
  acquireAdStudioClipLease,
  assertAdStudioQuota,
  createAdStudioClip,
  createAdStudioVideo,
  getAdStudioBrief,
  listAdStudioClips,
  listAdStudioVideos,
  markAdStudioClipFailed,
  markAdStudioClipReady,
  markAdStudioVideoFailed,
  markAdStudioVideoReady,
  recordAdStudioClipProgress,
  recordAdStudioUsage,
  releaseAdStudioClipLease,
  type AdStudioBriefModel,
  type AdStudioClipModel,
  type AdStudioUsageKind,
  type AdStudioVideoModel,
} from '@growthos/firebase-orm-models';
import { adStudioRuntime, ensureOrm } from './runtime';
import { AdStudioProviderError, type AdStudioProviderErrorCode } from './llm';
import { resolveAdStudioOmni, type AdStudioOmni, type OmniInteraction } from './omni';
import { adStudioClipObjectPath, adStudioVideoObjectPath, resolveAdStudioMediaStorage, type AdStudioMediaStorage } from './media-storage';
import type { AdStudioClipView, AdStudioVideoView } from './view';
import { concatClips, defaultFfmpegRunner, FfmpegUnavailableError, type FfmpegRunner } from './ffmpeg';

/**
 * The Ad Studio's video pipeline (KAN-231): starting renders and edits, advancing them, and joining
 * the finished clips. There is no job queue in this app, so progress is poll-driven - the page calls
 * the status route every few seconds while anything is generating, and each call moves every
 * generating clip at most one step (interaction finished? file ready? copy it into the bucket).
 * Each step is safe to repeat and guarded by a short per-clip lease (see the clip service).
 */

/** Longer than any real render; a clip still generating after this is given up on. */
export const CLIP_TIMEOUT_MS = 30 * 60_000;
/** A start call that never recorded its interaction id within this has died with its request. */
const START_GRACE_MS = 5 * 60_000;
const LEASE_MS = 120_000;
/** An assembly still marked running after this died with its request. */
export const ASSEMBLY_TIMEOUT_MS = 15 * 60_000;

/** Why a video request cannot go ahead, as a code the UI translates. */
export type AdStudioVideoRequestCode = 'scene_not_found' | 'already_generating' | 'clip_not_editable' | 'invalid_instruction' | 'not_ready' | 'already_assembling';

export class AdStudioVideoRequestError extends Error {
  constructor(public readonly code: AdStudioVideoRequestCode) {
    super(`Ad Studio video request refused: ${code}`);
    this.name = 'AdStudioVideoRequestError';
  }
}

export type AdStudioAssemblyFailure = 'ffmpeg_unavailable' | 'ffmpeg_failed' | 'storage_error';

export class AdStudioAssemblyError extends Error {
  constructor(public readonly code: AdStudioAssemblyFailure, message: string) {
    super(message);
    this.name = 'AdStudioAssemblyError';
  }
}

export interface AdStudioVideoDeps {
  omni: AdStudioOmni;
  storage: AdStudioMediaStorage;
  runner: FfmpegRunner;
  now?: () => Date;
}

/** Media storage and ffmpeg always; the video model only when GEMINI_API_KEY is configured. */
export function resolveAdStudioVideoDeps(env: NodeJS.ProcessEnv = process.env): { omni: AdStudioOmni | null; storage: AdStudioMediaStorage; runner: FfmpegRunner } {
  return { omni: resolveAdStudioOmni(env), storage: resolveAdStudioMediaStorage(env), runner: defaultFfmpegRunner(env) };
}

interface BriefContext {
  organizationId: string;
  projectId: string;
  briefId: string;
  actorId: string;
}

export type { AdStudioClipView, AdStudioVideoView };

const EDIT_SUFFIX = /\. Keep everything else the same\..*$/;

export function toAdStudioClipView(clip: AdStudioClipModel): AdStudioClipView {
  return {
    id: clip.id,
    sceneId: clip.scene_id,
    version: clip.version,
    kind: clip.kind,
    status: clip.status,
    failureReason: clip.failure_reason ?? null,
    sceneFingerprint: clip.scene_fingerprint,
    durationSeconds: clip.duration_seconds,
    parentClipId: clip.parent_clip_id ?? null,
    instruction: clip.kind === 'edit' ? clip.prompt.replace(EDIT_SUFFIX, '') : null,
    requestedOn: clip.requested_on,
    completedOn: clip.completed_on ?? null,
  };
}

export function toAdStudioVideoView(video: AdStudioVideoModel): AdStudioVideoView {
  return {
    id: video.id,
    status: video.status,
    failureReason: video.failure_reason ?? null,
    clipIds: [...video.clip_ids],
    durationSeconds: video.duration_seconds,
    requestedOn: video.requested_on,
    assembledOn: video.assembled_on ?? null,
  };
}

function summary(clip: AdStudioClipModel): AdStudioClipSummary & { model: AdStudioClipModel } {
  return { id: clip.id, sceneId: clip.scene_id, version: clip.version, status: clip.status, sceneFingerprint: clip.scene_fingerprint, durationSeconds: clip.duration_seconds, model: clip };
}

function videoContext(brief: AdStudioBriefModel): AdStudioVideoContext {
  return { format: brief.video_format, language: brief.language, productDescription: brief.product_description };
}

function clock(deps: Pick<AdStudioVideoDeps, 'now'>): Date {
  return deps.now ? deps.now() : new Date();
}

/** Provider failures that will not go away by polling again. */
const FINAL_PROVIDER_CODES: ReadonlySet<AdStudioProviderErrorCode> = new Set(['provider_billing', 'not_configured', 'refused', 'invalid_output']);
const FAILED_INTERACTION = new Set(['failed', 'cancelled', 'incomplete']);

async function storeInline(ctx: Omit<BriefContext, 'actorId'>, clip: AdStudioClipModel, data: Buffer, deps: AdStudioVideoDeps): Promise<void> {
  const objectPath = adStudioClipObjectPath({ ...ctx, clipId: clip.id });
  await deps.storage.upload(objectPath, data, 'video/mp4');
  await markAdStudioClipReady(clip, { gcsPath: objectPath, now: clock(deps) });
}

/** Applies what a start (or interaction poll) returned: failed, file known, inline video, or still running. */
async function applyInteraction(ctx: Omit<BriefContext, 'actorId'>, clip: AdStudioClipModel, interaction: OmniInteraction, deps: AdStudioVideoDeps): Promise<void> {
  if (interaction.error || FAILED_INTERACTION.has(interaction.status)) {
    await markAdStudioClipFailed(clip, interaction.error?.code ?? 'provider_error', clock(deps));
    return;
  }
  await recordAdStudioClipProgress(clip, { interactionId: interaction.id, fileName: interaction.video?.fileName ?? null });
  if (interaction.video?.inlineData) await storeInline(ctx, clip, interaction.video.inlineData, deps);
  else if (interaction.status === 'completed' && !interaction.video) await markAdStudioClipFailed(clip, 'invalid_output', clock(deps));
}

/** Starts one metered generation: quota first, a `generating` clip, the provider call, the usage row. */
async function startClip(
  ctx: BriefContext,
  deps: AdStudioVideoDeps,
  params: {
    kind: AdStudioUsageKind;
    sceneId: string;
    fingerprint: string;
    clipKind: 'render' | 'edit';
    parentClipId: string | null;
    prompt: string;
    aspectRatio: '9:16' | '16:9';
    durationSeconds: number;
    call: () => Promise<OmniInteraction>;
  },
): Promise<AdStudioClipModel> {
  const now = clock(deps);
  await assertAdStudioQuota({ organizationId: ctx.organizationId, projectId: ctx.projectId, kind: params.kind, units: params.durationSeconds, now });
  const clip = await createAdStudioClip({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    briefId: ctx.briefId,
    sceneId: params.sceneId,
    sceneFingerprint: params.fingerprint,
    kind: params.clipKind,
    parentClipId: params.parentClipId,
    prompt: params.prompt,
    model: deps.omni.model,
    aspectRatio: params.aspectRatio,
    durationSeconds: params.durationSeconds,
    requestedBy: ctx.actorId,
    now,
  });
  const usage = {
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    kind: params.kind,
    provider: 'gemini',
    model: deps.omni.model,
    units: params.durationSeconds,
    briefId: ctx.briefId,
    actorId: ctx.actorId,
    now,
  };
  let interaction: OmniInteraction;
  try {
    interaction = await params.call();
  } catch (error) {
    const code = error instanceof AdStudioProviderError ? error.code : 'provider_error';
    await recordAdStudioUsage({ ...usage, outcome: 'failed', failureReason: code });
    await markAdStudioClipFailed(clip, code, clock(deps));
    throw error;
  }
  await recordAdStudioUsage({ ...usage, outcome: interaction.error ? 'failed' : 'succeeded', failureReason: interaction.error?.code ?? null });
  try {
    await applyInteraction(ctx, clip, interaction, deps);
  } catch (error) {
    // The generation is running and paid for; a storage hiccup here is retried by the next status poll.
    console.error('[ad-studio] recording a started clip failed; the status poll will retry', { clipId: clip.id, error: error instanceof Error ? error.message : String(error) });
  }
  return clip;
}

function generatingFor(clips: readonly AdStudioClipModel[], sceneId: string): boolean {
  return clips.some((clip) => clip.scene_id === sceneId && clip.status === 'generating');
}

/** Renders one scene from its current script (units = the scene's seconds, kind `video_scene`). */
export async function startSceneRender(ctx: BriefContext & { sceneId: string }, deps: AdStudioVideoDeps): Promise<AdStudioClipModel> {
  await ensureOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const scene = brief.scenes.find((candidate) => candidate.id === ctx.sceneId);
  if (!scene) throw new AdStudioVideoRequestError('scene_not_found');
  const clips = await listAdStudioClips(ctx.organizationId, ctx.projectId, ctx.briefId);
  if (generatingFor(clips, scene.id)) throw new AdStudioVideoRequestError('already_generating');
  const context = videoContext(brief);
  const prompt = buildScenePrompt(scene, context);
  const aspectRatio = AD_STUDIO_ASPECT_RATIO[brief.video_format];
  return startClip(ctx, deps, {
    kind: 'video_scene',
    sceneId: scene.id,
    fingerprint: sceneFingerprint(scene, context),
    clipKind: 'render',
    parentClipId: null,
    prompt,
    aspectRatio,
    durationSeconds: scene.durationSeconds,
    call: () => deps.omni.startSceneGeneration({ prompt, aspectRatio }),
  });
}

/**
 * Edits the scene's newest ready clip by an instruction, chaining from its Gemini interaction
 * (kind `video_edit`, units = that clip's seconds). The edit belongs to the same version of the
 * scene as the clip it started from, so it inherits that clip's fingerprint.
 */
export async function startSceneEdit(ctx: BriefContext & { sceneId: string; instruction: string }, deps: AdStudioVideoDeps): Promise<AdStudioClipModel> {
  const instruction = ctx.instruction.trim();
  if (instruction.length === 0) throw new AdStudioVideoRequestError('invalid_instruction');
  await ensureOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  if (!brief.scenes.some((candidate) => candidate.id === ctx.sceneId)) throw new AdStudioVideoRequestError('scene_not_found');
  const clips = await listAdStudioClips(ctx.organizationId, ctx.projectId, ctx.briefId);
  if (generatingFor(clips, ctx.sceneId)) throw new AdStudioVideoRequestError('already_generating');
  const parent = clips
    .filter((clip) => clip.scene_id === ctx.sceneId && clip.status === 'ready' && clip.interaction_id)
    .sort((a, b) => b.version - a.version)[0];
  if (!parent?.interaction_id) throw new AdStudioVideoRequestError('clip_not_editable');
  const text = buildSceneEditInstruction(instruction);
  const aspectRatio = AD_STUDIO_ASPECT_RATIO[brief.video_format];
  const previousInteractionId = parent.interaction_id;
  return startClip(ctx, deps, {
    kind: 'video_edit',
    sceneId: ctx.sceneId,
    fingerprint: parent.scene_fingerprint,
    clipKind: 'edit',
    parentClipId: parent.id,
    prompt: text,
    aspectRatio,
    durationSeconds: parent.duration_seconds,
    call: () => deps.omni.startSceneEdit({ previousInteractionId, instruction: text, aspectRatio }),
  });
}

/**
 * Renders every scene that has no usable clip and nothing in flight. The whole batch is checked
 * against the daily video limit first, so it either starts or is refused as one; it stops at the
 * first provider failure (a billing refusal would refuse every scene).
 */
export async function startRenderAll(ctx: BriefContext, deps: AdStudioVideoDeps): Promise<AdStudioClipModel[]> {
  await ensureOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const clips = await listAdStudioClips(ctx.organizationId, ctx.projectId, ctx.briefId);
  const states = sceneVideoStates(brief.scenes, clips.map(summary), videoContext(brief));
  const cost = renderAllCost(states, brief.scenes);
  if (cost.sceneIds.length === 0) return [];
  await assertAdStudioQuota({ organizationId: ctx.organizationId, projectId: ctx.projectId, kind: 'video_scene', units: cost.seconds, now: clock(deps) });
  const started: AdStudioClipModel[] = [];
  for (const sceneId of cost.sceneIds) started.push(await startSceneRender({ ...ctx, sceneId }, deps));
  return started;
}

/** Moves one generating clip at most one step. Never throws for a provider hiccup - the next poll retries. */
async function advanceClip(ctx: Omit<BriefContext, 'actorId'>, clip: AdStudioClipModel, deps: AdStudioVideoDeps): Promise<void> {
  const now = clock(deps);
  const age = now.getTime() - new Date(clip.requested_on).getTime();
  if (age > CLIP_TIMEOUT_MS) {
    await markAdStudioClipFailed(clip, 'timed_out', now);
    return;
  }
  const token = await acquireAdStudioClipLease(clip, { ttlMs: LEASE_MS, now });
  if (!token) return;
  try {
    if (!clip.interaction_id) {
      if (age > START_GRACE_MS) await markAdStudioClipFailed(clip, 'provider_error', now);
      return;
    }
    let fileName = clip.file_name ?? null;
    if (!fileName) {
      const interaction = await deps.omni.getInteraction(clip.interaction_id);
      await applyInteraction(ctx, clip, interaction, deps);
      fileName = interaction.video?.fileName ?? null;
      if (!fileName) return;
    }
    const file = await deps.omni.getFileState(fileName);
    if (file.state === 'PROCESSING') return;
    if (file.state === 'FAILED') {
      await markAdStudioClipFailed(clip, 'provider_error', clock(deps));
      return;
    }
    const bytes = await deps.omni.downloadFile(fileName);
    const objectPath = adStudioClipObjectPath({ ...ctx, clipId: clip.id });
    await deps.storage.upload(objectPath, bytes, 'video/mp4');
    await markAdStudioClipReady(clip, { gcsPath: objectPath, now: clock(deps) });
  } catch (error) {
    if (error instanceof AdStudioProviderError && FINAL_PROVIDER_CODES.has(error.code)) {
      await markAdStudioClipFailed(clip, error.code, clock(deps));
      return;
    }
    // Rate limits, network errors and storage hiccups: leave it generating for the next poll; the
    // clip times out after CLIP_TIMEOUT_MS if the problem never clears.
    console.error('[ad-studio] advancing clip failed; will retry on the next poll', { clipId: clip.id, error: error instanceof Error ? error.message : String(error) });
  } finally {
    await releaseAdStudioClipLease(clip, token).catch(() => undefined);
  }
}

/**
 * The status poll: advances every generating clip of the brief one step, gives up on assemblies
 * that died with their request, and returns the brief's clips and videos as they now stand.
 */
export async function advanceBriefVideo(ctx: Omit<BriefContext, 'actorId'>, deps: AdStudioVideoDeps): Promise<{ clips: AdStudioClipView[]; videos: AdStudioVideoView[] }> {
  await ensureOrm();
  await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const clips = await listAdStudioClips(ctx.organizationId, ctx.projectId, ctx.briefId);
  await Promise.all(clips.filter((clip) => clip.status === 'generating').map((clip) => advanceClip(ctx, clip, deps)));
  const now = clock(deps);
  const videos = await listAdStudioVideos(ctx.organizationId, ctx.projectId, ctx.briefId);
  await Promise.all(
    videos
      .filter((video) => video.status === 'assembling' && now.getTime() - new Date(video.requested_on).getTime() > ASSEMBLY_TIMEOUT_MS)
      .map((video) => markAdStudioVideoFailed(video, 'timed_out', now)),
  );
  return listBriefVideo(ctx);
}

export async function listBriefVideo(ctx: Omit<BriefContext, 'actorId'>): Promise<{ clips: AdStudioClipView[]; videos: AdStudioVideoView[] }> {
  await ensureOrm();
  const [clips, videos] = await Promise.all([listAdStudioClips(ctx.organizationId, ctx.projectId, ctx.briefId), listAdStudioVideos(ctx.organizationId, ctx.projectId, ctx.briefId)]);
  return { clips: clips.map(toAdStudioClipView), videos: videos.map(toAdStudioVideoView) };
}

/**
 * Joins the newest ready, current clip of every scene in script order into one MP4 of at most 60
 * seconds, stores it and records it. Runs inside the request: work files go to a fresh temp folder
 * (in memory on Cloud Run) that is always removed.
 */
export async function assembleBriefVideo(ctx: BriefContext, deps: Pick<AdStudioVideoDeps, 'storage' | 'runner' | 'now'>): Promise<AdStudioVideoModel> {
  await ensureOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const clips = await listAdStudioClips(ctx.organizationId, ctx.projectId, ctx.briefId);
  const plan = assemblyPlan(brief.scenes, clips.map(summary), videoContext(brief));
  if (!plan) throw new AdStudioVideoRequestError('not_ready');
  const now = clock(deps);
  const existing = await listAdStudioVideos(ctx.organizationId, ctx.projectId, ctx.briefId);
  if (existing.some((video) => video.status === 'assembling' && now.getTime() - new Date(video.requested_on).getTime() <= ASSEMBLY_TIMEOUT_MS)) {
    throw new AdStudioVideoRequestError('already_assembling');
  }
  const video = await createAdStudioVideo({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    briefId: ctx.briefId,
    clipIds: plan.map((entry) => entry.clip.id),
    sceneIds: plan.map((entry) => entry.sceneId),
    aspectRatio: AD_STUDIO_ASPECT_RATIO[brief.video_format],
    durationSeconds: plan.reduce((sum, entry) => sum + entry.seconds, 0),
    requestedBy: ctx.actorId,
    now,
  });
  const workDir = await mkdtemp(path.join(tmpdir(), 'ad-studio-'));
  let stage: AdStudioAssemblyFailure = 'storage_error';
  try {
    const local: { file: string; seconds: number }[] = [];
    for (const [index, entry] of plan.entries()) {
      const file = path.join(workDir, `clip-${index}.mp4`);
      await deps.storage.downloadToFile(entry.clip.model.gcs_path as string, file);
      local.push({ file, seconds: entry.seconds });
    }
    stage = 'ffmpeg_failed';
    const output = path.join(workDir, 'video.mp4');
    const { durationSeconds } = await (adStudioRuntime().concatClips ?? concatClips)({ clips: local, output, format: brief.video_format, runner: deps.runner });
    stage = 'storage_error';
    const objectPath = adStudioVideoObjectPath({ ...ctx, videoId: video.id });
    await deps.storage.upload(objectPath, await readFile(output), 'video/mp4');
    return await markAdStudioVideoReady(video, { gcsPath: objectPath, durationSeconds, now: clock(deps) });
  } catch (error) {
    const code: AdStudioAssemblyFailure = error instanceof FfmpegUnavailableError ? 'ffmpeg_unavailable' : stage;
    console.error('[ad-studio] assembly failed', { videoId: video.id, code, error: error instanceof Error ? error.message : String(error) });
    await markAdStudioVideoFailed(video, code, clock(deps));
    throw new AdStudioAssemblyError(code, error instanceof Error ? error.message : String(error));
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
